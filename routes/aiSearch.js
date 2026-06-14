const express = require('express');
const axios = require('axios');
const router = express.Router();
const Fuse = require('fuse.js');  // <=== THÊM DÒNG NÀY

const Document = require('../models/Document');
const searchGoogle = require('../services/googleSearch');

// <=== THÊM HÀM LOẠI BỎ DẤU (dùng cho Fuse)
const removeAccents = (str) => {
    if (!str) return '';
    str = str.toLowerCase();
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
    str = str.replace(/đ/g, 'd');
    return str;
};

router.post('/search', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query?.trim()) {
            return res.status(400).json({
                message: 'Thiếu câu hỏi'
            });
        }

        // =========================
        // 1. Lấy tài liệu internal
        // =========================

        const allDocuments = await Document.find({
            status: 'approved'
        })
            .populate('subject_id', 'name');

        // <=== THÊM BƯỚC LỌC FUSE (lấy TOP 5 tài liệu khớp nhất)
        const normalizedQuery = removeAccents(query);

        const docsForFuse = allDocuments.map(doc => ({
            ...doc.toObject(),
            _searchTitle: removeAccents(doc.title || ''),
            _searchSubject: removeAccents(doc.subject_id?.name || ''),
        }));

        const fuse = new Fuse(docsForFuse, {
            keys: [
                { name: '_searchTitle', weight: 0.7 },
                { name: '_searchSubject', weight: 0.3 },
            ],
            threshold: 0.4,
            ignoreLocation: true,
            minMatchCharLength: 2,
        });

        const fuseResults = fuse.search(normalizedQuery);
        const documents = fuseResults.slice(0, 5).map(r => r.item);  // <=== CHỈ LẤY TOP 5

        // =========================
        // 2. Search Google (SỬA QUERY)
        // =========================

        const searchQuery = `${query} (giáo trình OR "bài giảng" OR "tài liệu học tập") filetype:pdf`;

        let googleResults = [];

        // <=== SỬA: chỉ 1 query thay vì vòng lặp
        const results = await searchGoogle(searchQuery);
        googleResults.push(...results);

        // Remove duplicate URL
        googleResults = googleResults.filter(
            (item, index, self) =>
                index === self.findIndex(x => x.url === item.url)
        );

        googleResults = googleResults.slice(0, 15);

        // =========================
        // 3. Prompt Gemini
        // =========================

        const prompt = `

Bạn là trợ lý tìm kiếm tài liệu học tập.

DANH SÁCH TÀI LIỆU INTERNAL:

${documents.map((doc, idx) => `${idx + 1}.
ID: ${doc._id}
Tiêu đề: ${doc.title}
Mô tả: ${doc.description || 'Không có'}
Môn học: ${doc.subject_id?.name || 'Chưa phân loại'}`).join('\n')}

KẾT QUẢ GOOGLE:

${googleResults.map((item, idx) => `${idx + 1}.
Tiêu đề: ${item.title}
URL: ${item.url}
Mô tả: ${item.snippet}`).join('\n')}

CÂU HỎI:
"${query}"

QUY TẮC:

1. Ưu tiên tài liệu INTERNAL.

2. Nếu INTERNAL không phù hợp:
   chọn từ GOOGLE RESULTS.

3. TUYỆT ĐỐI KHÔNG:

   * tạo URL mới
   * sửa URL
   * bịa tài liệu

4. Nếu chọn external:
   URL phải lấy nguyên văn từ GOOGLE RESULTS.

5. Chọn tối đa 5 tài liệu.

TRẢ VỀ JSON DUY NHẤT:

{
"answer": "string",
"documents": [
{
"id": "id hoặc null",
"title": "string",
"reason": "string",
"score": 90,
"source": "internal hoặc external",
"url": "url hoặc null"
}
]
}
`;

        // =========================
        // 4. Call Gemini
        // =========================

        const geminiResponse = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [
                    {
                        parts: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ]
            }
        );

        const aiText =
            geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
            '{}';

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
            console.error('Parse Gemini JSON error:', error);
        }

        // =========================
        // 5. Build results
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

            if (
                doc.source === 'external' &&
                doc.url &&
                googleResults.some(g => g.url === doc.url)
            ) {
                externalDocs.push({
                    _id: `ext_${Date.now()}_${externalDocs.length}`,
                    title: doc.title,
                    description:
                        doc.reason || 'Tài liệu tham khảo từ Google',

                    file_url: doc.url,
                    file_type: 'external',

                    source: 'external',

                    aiReason: doc.reason,
                    aiScore: doc.score,

                    subject_id: {
                        name: '📡 Google Search'
                    },

                    user_id: {
                        name: 'Google'
                    },

                    download_count: 0
                });
            }
        }

        // =========================
        // 6. Fallback
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
                aiReason: 'Kết quả tìm kiếm phù hợp',
                aiScore: 70,
                subject_id: {
                    name: '📡 Google Search'
                },
                user_id: {
                    name: 'Google'
                },
                download_count: 0
            }));
        }

        // =========================
        // 7. Answer
        // =========================

        let answer = aiResponse.answer;

        if (!answer) {
            if (internalDocs.length > 0) {
                answer = `📚 Tìm thấy ${internalDocs.length} tài liệu trong hệ thống.`;
            } else if (results.length > 0) {
                answer = `🔍 Không tìm thấy tài liệu phù hợp trong hệ thống, đây là các nguồn tham khảo từ Google.`;
            } else {
                answer = `😔 Không tìm thấy tài liệu phù hợp với "${query}".`;
            }
        }

        return res.json({
            query,
            answer,
            results,
            count: results.length
        });

    } catch (err) {
        console.error(
            'AI Search error:',
            err.response?.data || err.message
        );

        return res.status(500).json({
            query: req.body.query,
            answer: 'Có lỗi xảy ra, vui lòng thử lại sau.',
            results: [],
            count: 0
        });
    }

});

module.exports = router;