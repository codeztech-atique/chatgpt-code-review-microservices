const AWS = require('aws-sdk');
const axios = require('axios');
const { Configuration, OpenAIApi } = require('openai');

AWS.config.update({
    region: process.env.REGION, // Make sure to set this in your environment variables
});

const openai = new OpenAIApi(new Configuration({ apiKey: process.env.GPT_TOKEN }));

module.exports.codeReviewByAI = async (event, context) => {
    try {
        console.log("Received DynamoDB Stream event:", JSON.stringify(event));

        for (const record of event.Records) {
            if (record.eventName === 'INSERT') {
                const newItem = AWS.DynamoDB.Converter.unmarshall(record.dynamodb.NewImage);

                // Fetch file contents and generate review data
                const filesData = await fetchFilesData(newItem.filesChanged);
                const reviewData = await getGPTReview(filesData);

             
                // Comment post to GitHub and Create a pull request
                await closeOpenPullRequests(newItem.repoName, 'master', 'develop');
                await postCommentToGitHub(newItem.repoName, newItem.commitId, reviewData);
                await createPullRequest(newItem.repoName, 'master', 'develop', 'AI Code Review Enhancements and Fixes - '+newItem.commitId, reviewData);
            }
        }

        return { statusCode: 200, body: JSON.stringify({ message: "Process completed successfully." }) };
    } catch (err) {
        console.error("Error in processing:", err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};

async function fetchFilesData(filesChanged) {
    try {
        return Promise.all(filesChanged.map(async (file) => {
            const response = await axios.get(file.raw_url, {
                headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
            });
            return {
                role: 'user',
                content: response.data
            };
        }));
    } catch (err) {
        console.error("Error fetching file content:", err);
        throw new Error("Failed to fetch file content");
    }
}

async function getGPTReview(filesData) {
    try {
        let detailedPrompt = `Add proper styling like readme.md but don't add text readme.md & provide a detailed code review from the commit, The review should include:
        1. Summary by Zoom CodeGuard
        2. List of New Features, Enhancements, Bug Fixes, and Documentation changes
        3. A walkthrough explaining the integration and functionality enhancements
        4. Detailed changes per file
        5. Identify all the hardcoded value
        6. Highlight any hardcoded or potentially sensitive values`;

        const response = await openai.createChatCompletion({
            model: process.env.GPT_MODEL,
            messages: [
                { role: "system", content: detailedPrompt },
                ...filesData
            ]
        });

        let reviewData = response.data.choices[0].message.content;
        reviewData = reviewData.replace(/```\s*json\s*\n/, '');
        reviewData = reviewData.replace(/\n```$/, '');
        return reviewData;
    } catch (err) {
        console.error("Failed to call OpenAI:", err);
        throw new Error(`Failed to call OpenAI due to: ${err.message}`);
    }
}

async function closeOpenPullRequests(repoName, base, head) {
    const [owner, repo] = repoName.split('/');
    const pullsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&base=${base}&head=${owner}:${head}`;

    try {
        const openPRs = await axios.get(pullsUrl, {
            headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
        });

        for (const pr of openPRs.data) {
            const closeUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}`;
            await axios.patch(closeUrl, { state: "closed" }, {
                headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
            });
            console.log(`Closed PR #${pr.number}`);
        }
    } catch (err) {
        console.error('Failed to close open pull requests:', err);
        throw new Error(`Failed to close open pull requests: ${err.message}`);
    }
}

async function postCommentToGitHub(repoName, commitId, comment) {
    const [owner, repo] = repoName.split('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${commitId}/comments`;
    try {
        const response = await axios.post(url, { body: comment }, {
            headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
        });
        console.log('Comment posted to GitHub:', response.data);
        return response.data;
    } catch (err) {
        console.error('Failed to post comment to GitHub:', err);
        throw new Error(`Failed to post comment to GitHub: ${err.message}`);
    }
}

async function createPullRequest(repoName, base, head, title, body) {
    const [owner, repo] = repoName.split('/');
    const createPRUrl = `https://api.github.com/repos/${owner}/${repo}/pulls`;
    try {
        const prResponse = await axios.post(createPRUrl, {
            title: title,
            body: body,
            head: head,
            base: base
        }, {
            headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
        });
        console.log('Pull request created:', prResponse.data);
        return prResponse.data;
    } catch (err) {
        console.error('Failed to create pull request:', err);
        throw new Error(`Failed to create pull request: ${err.message}`);
    }
}
