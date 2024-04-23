// Insert and update into Elasticsearch
const AWS = require('aws-sdk');
const { Client } = require('@elastic/elasticsearch');

const indexName = process.env.PROD_COMMIT_REVIEWS;
const cloudId = process.env.PROD_ELASTIC_SEARCH_CLOUD_ID;
const userName = process.env.PROD_ELASTIC_SEARCH_USERNAME;
const password = process.env.PROD_ELASTIC_SEARCH_PASSWORD;

const elasticsearch = new Client({
    cloud: {
      id: cloudId,
    },
    auth: {
        username: userName,
        password: password
    }
})


function insertToELK(data) {
   return new Promise((resolve, reject) => {
        elasticsearch.index({
            index: indexName,
            // type: indexType,
            body: data
        }).then((response) => {
            resolve(response);
        }).catch((err) => {
            console.log(err);
            reject("Elasticsearch ERROR - data not inserted")
        }) 
   });
}

function updateInELK(data) { // Update by Id
    return new Promise((resolve, reject) => {
         elasticsearch.updateByQuery({
             index: indexName,
             body: {
                query: { match: { commitId: data.commitId } },
                script: {
                    inline: `
                       ctx._source.commitId = params.commitId;
                       ctx._source.filesChanged = params.filesChanged;
                       ctx._source.mergeToProduction = params.mergeToProduction;
                       ctx._source.repoName = params.repoName;
                       ctx._source.totalLinesAdded = params.totalLinesAdded;
                       ctx._source.userId = params.userId;
                    `,
                    lang: 'painless',
                    params: {
                        commitId: data.commitId,
                        filesChanged: data.filesChanged,
                        mergeToProduction: data.mergeToProduction,
                        repoName: data.repoName,
                        totalLinesAdded: data.totalLinesAdded,
                        userId: data.userId
                    }
                }
             }
         }).then((response) => {
             resolve(response);
         }).catch((err) => {
             console.log(err);
             reject("Elasticsearch ERROR - data not updated")
         }) 
     });
}

function removeFromELK(data) {
    return new Promise((resolve, reject) => {
        elasticsearch.deleteByQuery({
            index: indexName,
            body: {
                query: {
                    match: { commitId: data.commitId }
                }
             }
        }).then((response) => {
            resolve(response);
        }).catch((err) => {
            console.log(err);
            reject("Elasticsearch ERROR - data not deleted")
        }) 
    })
}


module.exports.crudReqToELK = async (event, context, callback) => {
// async function crudReqToELK(event) {
    const records = event.Records;
    try {
        for(let i = 0; i < records.length; i++) {
            const currentEvent = records[i];
            if(currentEvent.eventName == "INSERT") {
                const newImages = AWS.DynamoDB.Converter.unmarshall(currentEvent.dynamodb.NewImage)
                const insertIntoELK = await insertToELK(newImages);
                context.done(null, event);
            } else if(currentEvent.eventName == "MODIFY") {
                const newImages = AWS.DynamoDB.Converter.unmarshall(currentEvent.dynamodb.NewImage)
                const updateIntoELK = await updateInELK(newImages);
                context.done(null, event);
            } else if(currentEvent.eventName == "REMOVE") {
                const oldImage = AWS.DynamoDB.Converter.unmarshall(currentEvent.dynamodb.OldImage)
                const removeSingleDataFromELK = await removeFromELK(oldImage);
                context.done(null, event);
            }
        }
        
    } catch(err) {
        context.fail(err, null);
    }
}