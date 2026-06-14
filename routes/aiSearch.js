const express = require('express');
const axios = require('axios');
const router = express.Router();

const Document = require('../models/Document');
const searchGoogle = require('../services/googleSearch');

router.post('/search', async (req, res) => {
    try {
        const { query } = req.body;

        // =========================
        // 0. REQUEST LOG
        // =========================
        console.log("\n================ SEARCH START ================");
        console.log("QUERY:", query);

        if (!query?.trim()) {
            console.log("❌ Missing query");
            return res.status(400).json({ message: 'Thiếu câu hỏi' });
        }

        // =========================
        // 1. INTERNAL DOCS
        // =========================
        const documents = await Document.find({
            status: 'approved'
        })
            .populate('subject_id', 'name')
            .limit(30);

        console.log("\n===== INTERNAL DOCS =====");
        console.log("Count:", documents.length);

        documents.forEach((d, i) => {
            console.log(`${i + 1}. ${d.title}`);
        });

        console.log("==========================");

        // =========================
        // 2. GOOGLE SEARCH (CHỈ SỬA ĐOẠN NÀY)
        // =========================
        // Thay vì chạy 4 query, gộp thành 1 query duy nhất
        const searchQuery = `${query} (giáo trình OR "bài giảng" OR "tài liệu học tập") cho sinh viên đại học`;

        console.log("\n===== GOOGLE QUERY =====");
        console.log(searchQuery);

        let googleResults = [];

        try {
            googleResults = await searchGoogle(searchQuery);
            console.log("Results count:", googleResults?.length || 0);
            if (googleResults?.length > 0) {
                console.log("Sample:", googleResults[0]);
            }
        } catch (err) {
            console.log("❌ Google error:", err.message);
        }

        // Remove duplicates (vẫn giữ nguyên logic cũ)
        googleResults = googleResults.filter(
            (item, index, self) =>
                index === self.findIndex(x => x.url === item.url)
        );

        googleResults = googleResults.slice(0, 15);

        console.log("\n===== GOOGLE FINAL =====");
        console.log("Total:", googleResults.length);
        console.log(googleResults.slice(0, 3));
        console.log("========================");

        // =========================
        // 3. GEMINI PROMPT (GIỮ NGUYÊN)
        // =========================
        const prompt = `
Bạn là trợ lý tìm kiếm tài liệu học tập.

INTERNAL:
${documents.map((doc, idx) => `${idx + 1}.
ID: ${doc._id}
Tiêu đề: ${doc.title}
Môn: ${doc.subject_id?.name || 'N/A'}`).join('\n')}

GOOGLE:
${googleResults.map((item, idx) => `${idx + 1}.
Title: ${item.title}
URL: ${item.url}
Snippet: ${item.snippet}`).join('\n')}

CÂU HỎI: "${query}"
`;

        const geminiResponse = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [
                    {
                        parts: [{ text: prompt }]
                    }
                ]
            }
        );

        const aiText =
            geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

        console.log("\n===== GEMINI RAW =====");
        console.log(aiText);
        console.log("======================");

        // =========================
        // 4. PARSE AI (GIỮ NGUYÊN)
        // =========================
        let aiResponse = {
            answer: '',
            documents: []
        };

        try {
            const jsonMatch = aiText.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                aiResponse = JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            console.log("❌ Parse error:", error.message);
        }

        console.log("\n===== PARSED AI =====");
        console.log(JSON.stringify(aiResponse, null, 2));
        console.log("=====================");

        // =========================
        // 5. BUILD RESULTS (GIỮ NGUYÊN)
        // =========================
        const internalDocs = [];
        const externalDocs = [];

        for (const doc of aiResponse.documents || []) {
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
            }

            if (doc.source === 'external' && doc.url) {
                externalDocs.push({
                    _id: `ext_${Date.now()}`,
                    title: doc.title,
                    description: doc.reason,
                    file_url: doc.url,
                    file_type: 'external',
                    source: 'external',
                    subject_id: { name: 'Google' },
                    user_id: { name: 'Google' },
                    download_count: 0
                });
            }
        }

        // =========================
        // 6. FALLBACK (GIỮ NGUYÊN)
        // =========================
        let results =
            internalDocs.length > 0
                ? internalDocs
                : externalDocs;

        if (results.length === 0) {
            results = googleResults.slice(0, 5).map((item, index) => ({
                _id: `fallback_${index}`,
                title: item.title,
                description: item.snippet,
                file_url: item.url,
                file_type: 'external',
                source: 'external',
                subject_id: { name: 'Google' },
                user_id: { name: 'Google' },
                download_count: 0
            }));
        }

        // =========================
        // 7. ANSWER (GIỮ NGUYÊN)
        // =========================
        let answer = aiResponse.answer;

        if (!answer) {
            if (internalDocs.length > 0) {
                answer = `📚 Tìm thấy ${internalDocs.length} tài liệu nội bộ.`;
            } else if (results.length > 0) {
                answer = `🔍 Không có tài liệu nội bộ, hiển thị kết quả Google.`;
            } else {
                answer = `❌ Không tìm thấy tài liệu phù hợp.`;
            }
        }

        console.log("\n===== FINAL =====");
        console.log("Internal:", internalDocs.length);
        console.log("External:", externalDocs.length);
        console.log("Google:", googleResults.length);
        console.log("Results:", results.length);
        console.log("================================\n");

        return res.json({
            query,
            answer,
            results,
            count: results.length
        });

    } catch (err) {
        console.log("❌ SEARCH ERROR:", err?.response?.data || err.message);

        return res.status(500).json({
            query: req.body.query,
            answer: 'Có lỗi xảy ra',
            results: [],
            count: 0
        });
    }
});

module.exports = router;