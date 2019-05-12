process.env.PATH = `${process.env.PATH}:${process.env.LAMBDA_TASK_ROOT}`;

const wkhtmltopdf = require("./utils/wkhtmltopdf");
const errorUtil = require("./utils/error");
const _ = require("lodash");
const AWS = require("aws-sdk");
const S3 = new AWS.S3({ signatureVersion: "v4" });
const SQS = new AWS.SQS();

const getParamsFromS3 = async (bucket, key, callback) => {
    if (!bucket || !key) {
        const errorResponse = errorUtil.createErrorResponse(400, "Bucket or file-path not available");

        callback(errorResponse);
        return;
    }

    try {
        const object = await S3.getObject({
            Bucket: bucket,
            Key: key
        }).promise();

        const fileContent = object.Body.toString();
        const params = JSON.parse(fileContent);

        return params;
    } catch (err) {
        callback(errorUtil.createErrorResponse(500, "Error occured downloading parameter file from S3", err));
    }
};

const moveS3File = async (bucket, from, toFolder, callback) => {
    const PROCESSED_FOLDER = process.env.S3_PROCESSED_FOLDER || "HTML2PDF/Processed";

    if (!bucket || !from) {
        const errorResponse = errorUtil.createErrorResponse(400, "Missing required parameters to move file");

        callback(errorResponse);
        return;
    }

    let fileName = "";

    if (_.includes(from, "/")) {
        const fileInfo = from.split("/");
        fileName = _.last(fileInfo);
    } else {
        fileName = from;
    }

    try {
        await S3.copyObject({
            Bucket: bucket,
            CopySource: `${bucket}/${from}`,
            Key: `${PROCESSED_FOLDER}/${fileName}`
        }).promise();

        await S3.deleteObject({
            Bucket: bucket,
            Key: from
        }).promise();

        return `File moved from: ${from} to ${PROCESSED_FOLDER}/${fileName}`;
    } catch (err) {
        callback(errorUtil.createErrorResponse(500, "Error occured downloading parameter file from S3", err));
    }
};

const pdfBuffer = async (html, options, callback) => {
    try {
        // ["--page-size Letter", "--orientation Portrait", "--margin-bottom 1", "--margin-top 1", "--margin-right 1", "--margin-left 1"]
        let pdfOptions = [];

        if (options) {
            pdfOptions = options;
        } else {
            pdfOptions = ["--margin-bottom 0", "--margin-right 0", "--margin-left 0"];
        }

        const pdfbuffer = await wkhtmltopdf(html, pdfOptions);

        return pdfbuffer;
    } catch (err) {
        callback(errorUtil.createErrorResponse(500, "Error occured while generating PDF", err));
    }
};

const uploadToS3 = async (buffer, bucket, key, callback) => {
    if (!buffer) {
        const errorResponse = errorUtil.createErrorResponse(400, "No PDF buffer available for upload");

        callback(errorResponse);
        return;
    }

    try {
        const object = await S3.putObject({
            Body: buffer,
            ContentType: "application/pdf",
            Bucket: bucket,
            Key: key
        }).promise();

        return object;
    } catch (err) {
        callback(errorUtil.createErrorResponse(500, "Error occured while uploading PDF", err));
    }
};

const sendMessageToSQS = async (eventParams, callback) => {
    const QUEUE_URL = eventParams.QueueUrl || process.env.SQS_QUEUE_URL;

    if (QUEUE_URL) {
        try {
            console.log(`Sending message to SQS Queue: ${QUEUE_URL}`);

            const MessageBody = {
                fileKey: eventParams.saveToPath || "",
                data: eventParams.callbackData || ""
            };

            await SQS.sendMessage({
                QueueUrl: QUEUE_URL,
                MessageBody: JSON.stringify(MessageBody),
                MessageGroupId: "htmlToPdf"
            }).promise();

            console.log(`Message sent to SQS Queue: ${QUEUE_URL}`);

            return;
        } catch (err) {
            callback(errorUtil.createErrorResponse(500, "Error while sending message to SQS", err));
        }
    } else {
        console.log("NOT sending to SQS");
    }
};

exports.handler = async (event, context, callback) => {
    // Log event
    console.log("START new event", event);

    let eventParams = {};
    const bucket = _.get(event, "Records[0].s3.bucket.name", "") || process.env.S3_BUCKET;
    const key = _.get(event, "Records[0].s3.object.key", "");

    console.log("Key", key);

    // Bucket or Key is missing from trigger (which means the function has NOT been trigged by S3 upload)
    // Or html param is missing if the fuction has been called manually
    if ((!bucket || !key) && (!event.html)) {
        const errorResponse = errorUtil.createErrorResponse(400, "Validation error: Missing requred params.");

        callback(errorResponse);
        return;
    }

    try {
        // If the function was triggered from S3, we get contents of the file and then move file to PROCESSED_FOLDER
        if (bucket && key) {
            eventParams = await getParamsFromS3(bucket, key, callback);
            console.log("Got params from S3 file", eventParams);

            await moveS3File(bucket, key, callback);

            console.log("File moved to PROCESSED_FOLDER", key);
        }

        // Either the file did not contain params
        // Or the function has been called manually/directly
        if (_.isEmpty(eventParams)) {
            console.log("Got empty eventParams. Set default", key);

            eventParams.html = event.html;
            eventParams.options = event.options;
            eventParams.saveToPath = event.saveToPath;
            eventParams.QueueUrl = event.QueueUrl;
            eventParams.callbackData = event.callbackData;
        }

        // Using wkhtmltopdf, we now get a pdf content buffer
        const buffer = await pdfBuffer(eventParams.html, eventParams.options, callback);
        let response = buffer.toString("base64");

        // If we have been given a path to save to S3, we save the file
        console.log("Pdf prepared, lets save the pdf to ", eventParams.saveToPath);
        if (bucket && eventParams.saveToPath) {
            await uploadToS3(buffer, bucket, eventParams.saveToPath, callback);
            response = `PDF generated and saved to ${eventParams.saveToPath}`;
        }

        console.log("Send SQS to ", eventParams.QueueUrl);

        // If we have been given a SQS Queue URL we will send message to SQS
        await sendMessageToSQS(eventParams, callback);

        console.log("Sent SQS", key);

        callback(null, {
            data: response
        });
    } catch (error) {
        callback(errorUtil.createErrorResponse(500, "Internal server error", error));
    }
};

