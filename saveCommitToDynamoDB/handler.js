const AWS = require('aws-sdk');

AWS.config.update({
    region: process.env.REGION, // replace with your region
});

const docClient = new AWS.DynamoDB.DocumentClient();

module.exports.saveCommitToDB = async (event, context) => {
    try {  
        // Loop through each record if multiple records are sent in a batch
        for (const record of event.Records) {
            const body = JSON.parse(record.body);
            
            // Extracting data from the body
            const commitData = {
                commitId: body.commitId,
                userId: body.committerUserId,
                totalLinesAdded: body.totalLinesAdded,
                repoName: body.repoName,
                filesChanged: body.filesChanged,
                mergeToProduction: false
            };
            
            // Call the function to store data in DynamoDB
            await storeDataInDynamoDB(commitData);
            console.log("Data stored for commitId:", body.commitId);
        }

        // Finish the Lambda function successfully
        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Data processed and stored successfully." })
        };
    } catch(err) {
        console.error("Error:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to process data' })
        };
    }
}

const storeDataInDynamoDB = async (data) => {
    const params = {
        TableName: process.env.PROD_COMMIT_REVIEWS,
        Item: data
    };
    try {
        const result = await docClient.put(params).promise();
        console.log("Successfully stored data in DynamoDB", result);
    } catch (err) {
        console.error("Error storing data in DynamoDB:", err);
        throw err;
    }
};
