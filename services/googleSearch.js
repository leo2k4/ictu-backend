const axios = require("axios");

async function searchGoogle(query) {
    try {
        const { data } = await axios.post(
            "https://google.serper.dev/search",
            {
                q: query,
                num: 10
            },
            {
                headers: {
                    'X-API-KEY': process.env.SERPER_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        const items = data.organic || [];

        return items.map(item => ({
            title: item.title,
            url: item.link,
            snippet: item.snippet
        }));
    } catch (err) {
        console.error("Serper Search Error:", err.response?.data || err.message);
        return [];
    }
}

module.exports = searchGoogle;