# Pdf generator on AWS lambda
[![CircleCI](https://circleci.com/gh/Uninite/lambda-html-to-pdf.svg?style=svg&circle-token=43345f82b359007a5b88b6741b351709b892a515)](https://circleci.com/gh/Uninite/lambda-html-to-pdf)

AWS Lambda script that generates PDF

# How does it work?
1. You can call the function directly (see [this](https://stackoverflow.com/questions/33659059/invoke-amazon-lambda-function-from-node-app?answertab=active#tab-top)), or
2. You can create a .json file containing the parameters and `PUT` it to `HTML2PDF/New` folder in S3-bucket 
3. The lambda script will then create the PDF buffer AND
 - Move the .json file from HTML2PDF/New` to HTML2PDF/Processed` (if you are calling the script by putting a .json file in S3)
 - Save the PDF buffer to a PDF file (if you have added the `saveToPath` parameter
 - Send message to AWS SQS Queue (if you have added the `QueueUrl` parameter
 - Additionally, it can also include specified data (that you may need in your code logic) in the SQS message if you add the `callbackData` parameter.

## Example parameters
```json
{
  "html": "<!DOCTYPE html><html><head><title>Hello</title></head><body>Here comes the content!<body></html>",
  "options": [
    "--page-size Letter",
    "--orientation Landscape",
    "--margin-bottom 1",
    "--margin-top 1",
    "--margin-right 1",
    "--margin-left 1"
  ],
  "saveToPath": "HTML2PDF/_TMP/hello.pdf", 
  "QueueUrl": "https://sqs.eu-west-1.amazonaws.com/628439637519/ul-local-risul.fifo",
  "callbackData": {
      "any": "thing",
      "more": "stuff"
  }
}
```

Please also [see this](wkhtmltopdf) for all options you have for PDF generation!
If its not clear yet, you add your PDF options to the `options` parameter above!
