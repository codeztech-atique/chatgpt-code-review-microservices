module.exports.codeReviewByAI = async (event, context) => {
    try {  
        console.log("Event:", JSON.stringify(event));
        context.done(null, event);
    } catch(err) {
        console.log("Error:", err)
        context.fail(err, null);
    }
}