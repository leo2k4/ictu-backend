const express = require('express');
const axios = require('axios');
const router = express.Router();
const Document = require('../models/Document');

// Tìm kiếm tài liệu bằng AI (hỗ trợ web)
router.post('/search', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ message: 'Thiếu câu hỏi' });
        }

        // Bước 1: Lấy danh sách tài liệu từ database
        const documents = await Document.find({ status: 'approved' })
            .populate('subject_id', 'name')
            .limit(50);

        // Bước 2: Tạo prompt cho Gemini (có hỗ trợ web)
        const prompt = `
Bạn là trợ lý tìm kiếm tài liệu học tập thông minh.

DANH SÁCH TÀI LIỆU CÓ SẴN TRONG HỆ THỐNG:
${documents.map((doc, idx) => `
${idx + 1}. ID: ${doc._id}
   Tiêu đề: ${doc.title}
   Mô tả: ${doc.description || 'Không có mô tả'}
   Môn học: ${doc.subject_id?.name || 'Chưa phân loại'}
`).join('\n')}

CÂU HỎI CỦA NGƯỜI DÙNG: "${query}"

QUY TẮC XỬ LÝ QUAN TRỌNG:
1. **ƯU TIÊN 1**: Nếu có tài liệu trong danh sách trên phù hợp → chọn 3-5 tài liệu, source="internal", id là id thật
2. **ƯU TIÊN 2**: Nếu KHÔNG có tài liệu nào phù hợp (danh sách rỗng) → hãy TỰ TÌM KIẾM TRÊN WEB các tài liệu/tài nguyên học tập liên quan, source="external", id=null, url=link thật

TRẢ VỀ JSON DUY NHẤT (không text khác, không giải thích thêm):
{
  "answer": "Câu trả lời thân thiện bằng tiếng Việt",
  "documents": [
    {
      "id": "document_id hoặc null",
      "title": "tiêu đề tài liệu",
      "reason": "lý do phù hợp ngắn gọn",
      "score": 85,
      "source": "internal hoặc external",
      "url": "link web (chỉ có nếu source=external)"
    }
  ]
}

VÍ DỤ external đúng:
{
  "id": null,
  "title": "Đề ôn thi Anh văn 1 có đáp án",
  "reason": "Tài liệu ôn tập phù hợp với yêu cầu",
  "score": 90,
  "source": "external",
  "url": "https://tailieu.vn/de-thi/de-on-thi-anh-van-1.html"
}

LƯU Ý: Nếu dùng external, url PHẢI là link thật, có thể truy cập được.
`;

        // Bước 3: Gọi Gemini API
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }]
            }
        );

        const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

        // Bước 4: Parse JSON từ response
        let aiResponse = { answer: '', documents: [] };
        try {
            const jsonMatch = aiText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                aiResponse = JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.log("Parse JSON lỗi:", e);
        }

        // Bước 5: Xử lý internal docs
        const internalDocs = [];
        const externalDocs = [];

        for (const doc of (aiResponse.documents || [])) {
            if (doc.source === 'internal' && doc.id) {
                const fullDoc = await Document.findById(doc.id)
                    .populate('subject_id', 'name')
                    .populate('user_id', 'name');
                if (fullDoc) {
                    internalDocs.push({
                        ...fullDoc.toObject(),
                        aiReason: doc.reason,
                        aiScore: doc.score,
                        source: 'internal'
                    });
                }
            } else if (doc.source === 'external' && doc.url) {
                externalDocs.push({
                    _id: `ext_${Date.now()}_${externalDocs.length}`,
                    title: doc.title,
                    description: doc.reason || 'Tài liệu tham khảo từ web',
                    file_url: doc.url,
                    file_type: 'external',
                    source: 'external',
                    aiReason: doc.reason,
                    aiScore: doc.score,
                    subject_id: { name: '📡 Web' },
                    user_id: { name: 'Internet' },
                    download_count: 0
                });
            }
        }

        // Bước 6: Ưu tiên internal, nếu không có thì dùng external
        const results = internalDocs.length > 0 ? internalDocs : externalDocs;

        // Bước 7: Tạo answer nếu thiếu
        let answer = aiResponse.answer;
        if (!answer) {
            if (internalDocs.length > 0) {
                answer = `📚 Tìm thấy ${internalDocs.length} tài liệu phù hợp trong hệ thống.`;
            } else if (externalDocs.length > 0) {
                answer = `🔍 Không có tài liệu trong hệ thống, mình đã tìm được ${externalDocs.length} nguồn tham khảo trên web cho bạn:`;
            } else {
                answer = `😔 Rất tiếc, tôi không tìm thấy tài liệu nào phù hợp với "${query}". Bạn có thể thử từ khóa khác nhé!`;
            }
        }

        res.json({
            query,
            answer,
            results,
            count: results.length
        });

    } catch (err) {
        console.error("AI Search error:", err.response?.data || err.message);
        res.status(500).json({
            query: req.body.query,
            answer: "Có lỗi xảy ra, vui lòng thử lại sau.",
            results: [],
            count: 0
        });
    }
});

module.exports = router;