const express = require('express');
const axios = require('axios');
const router = express.Router();
const Document = require('../models/Document');

// Tìm kiếm tài liệu bằng AI
router.post('/search', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ message: 'Thiếu câu hỏi' });
        }

        // Bước 1: Lấy danh sách tài liệu từ database
        const documents = await Document.find({ status: 'approved' })
            .populate('subject_id', 'name')
            .limit(50); // Giới hạn 50 tài liệu để AI xử lý

        // Bước 2: Tạo prompt cho Gemini
        const prompt = `
Bạn là trợ lý tìm kiếm tài liệu học tập.

DANH SÁCH TÀI LIỆU CÓ SẴN:
${documents.map((doc, idx) => `
${idx + 1}. Tiêu đề: ${doc.title}
   Mô tả: ${doc.description || 'Không có mô tả'}
   Môn học: ${doc.subject_id?.name || 'Chưa phân loại'}
   ID: ${doc._id}
`).join('\n')}

CÂU HỎI: "${query}"

YÊU CẦU: Chọn 5 tài liệu phù hợp nhất với câu hỏi trên.
Trả về JSON duy nhất, không có text khác, theo format:
[
  {
    "id": "document_id",
    "title": "tiêu đề",
    "reason": "lý do phù hợp ngắn gọn",
    "score": 95
  }
]

Nếu không có tài liệu nào phù hợp, trả về [].
`;

        // Bước 3: Gọi Gemini API
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }]
            }
        );

        const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

        // Bước 4: Parse JSON từ response
        let matchedDocs = [];
        try {
            // Tìm mảng JSON trong text
            const jsonMatch = aiText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                matchedDocs = JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.log("Parse JSON lỗi:", e);
        }

        // Bước 5: Lấy chi tiết tài liệu từ database
        const docIds = matchedDocs.map(d => d.id);
        const fullDocs = await Document.find({ _id: { $in: docIds } })
            .populate('subject_id', 'name')
            .populate('user_id', 'name');

        // Bước 6: Ghép kết quả
        const results = matchedDocs.map(aiDoc => {
            const fullDoc = fullDocs.find(d => d._id.toString() === aiDoc.id);
            if (!fullDoc) return null;
            return {
                ...fullDoc.toObject(),
                aiReason: aiDoc.reason,
                aiScore: aiDoc.score,
                source: 'internal'
            };
        }).filter(doc => doc !== null);

        res.json({
            query,
            results,
            count: results.length
        });

    } catch (err) {
        console.error("AI Search error:", err.response?.data || err.message);
        res.status(500).json({
            message: 'Lỗi AI Search',
            error: err.response?.data || err.message
        });
    }
});

module.exports = router;