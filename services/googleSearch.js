const axios = require("axios");

async function searchGoogle(query) {
    try {
        const { data } = await axios.get(
            "https://www.googleapis.com/customsearch/v1",
            {
                params: {
                    key: process.env.GOOGLE_SEARCH_API_KEY,
                    cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
                    q: query,
                    num: 10
                }
            }
        );

        return (data.items || []).map(item => ({
            title: item.title,
            url: item.link,
            snippet: item.snippet
        }));
    } catch (err) {
        console.error(
            "Google Search Error:",
            err.response?.data || err.message
        );
        return [];
    }
}

module.exports = searchGoogle;