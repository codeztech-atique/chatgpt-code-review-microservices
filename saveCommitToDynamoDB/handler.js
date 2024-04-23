module.exports.saveCommitToDB = async (event, context, callback) => {
    try {
        console.log(JSON.stringify(event));
        context.done(null, event);
    } catch(err) {
        console.log("Error:", err)
        context.fail(err, null);
    }
}

