process.env.PATH = `${process.env.PATH}:${process.env.LAMBDA_TASK_ROOT}`;

const wkhtmltopdf = require("./utils/wkhtmltopdf");
const errorUtil = require("./utils/error");

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
        callback(err, { statusCode: 500, body: '{ "message": "Error occured while generating PDF", "error": true }' });
    }
};

exports.handler = async (event, context, callback) => {
    if (!event.html) {
        const errorResponse = errorUtil.createErrorResponse(400, "Validation error: Missing field 'html'.");

        callback(errorResponse);
        return;
    }

    try {
        const buffer = await pdfBuffer(event.html, event.options, callback);

        callback(null, {
            data: buffer.toString("base64")
        });
    } catch (error) {
        callback(errorUtil.createErrorResponse(500, "Internal server error", error));
    }
};