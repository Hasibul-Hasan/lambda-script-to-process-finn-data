process.env.PATH = `${process.env.PATH}:${process.env.LAMBDA_TASK_ROOT}`;

const wkhtmltopdf = require("./utils/wkhtmltopdf");
const errorUtil = require("./utils/error");

exports.handler = function handler(event, context, callback) {
    if (!event.html) {
        const errorResponse = errorUtil.createErrorResponse(400, "Validation error: Missing field 'html'.");

        callback(errorResponse);
        return;
    }

    // ["--page-size Letter", "--orientation Portrait", "--margin-bottom 1", "--margin-top 1", "--margin-right 1", "--margin-left 1"]
    let pdfOptions = [];

    if (event.options) {
        pdfOptions = event.options;
    } else {
        pdfOptions = ["--margin-bottom 0", "--margin-right 0", "--margin-left 0"];
    }

    wkhtmltopdf(event.html, pdfOptions)
        .then(buffer => {
            callback(null, {
                data: buffer.toString("base64")
            });
        }).catch(error => {
            callback(errorUtil.createErrorResponse(500, "Internal server error", error));
        });
};