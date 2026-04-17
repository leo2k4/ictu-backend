const express = require('express');
const axios = require('axios');
const router = express.Router();

router.post('/ask', async (req, res) => {
    try {
        const { question } = req.body;

        if (!question) {
            return res.status(400).json({ message: 'Thiếu câu hỏi' });
        }

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [
                    {
                        parts: [
                            {
                                text: `Bạn là gia sư. Giải bài ngắn gọn, dễ hiểu:\n${question}`
                            }
                        ]
                    }
                ]
            }
        );

        const answer =
            response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
            "Không có phản hồi";

        res.json({ answer });

    } catch (err) {
        console.error("Gemini error:", err.response?.data || err.message);
        res.status(500).json({
            message: 'Lỗi AI',
            error: err.response?.data || err.message
        });
    }
});

module.exports = router;