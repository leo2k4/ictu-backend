const express = require('express');
const axios = require('axios');
const router = express.Router();
const Fuse = require('fuse.js');

const Document = require('../models/Document');
const searchGoogle = require('../services/googleSearch');

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
            return res.status(400).json({ message: 'Thiếu câu hỏi' });
        }

        // =========================
        // Bước 1: Lấy ALL internal documents
        // =========================
        const allDocuments = await Document.find({ status: 'approved' })
            .populate('subject_id', 'name');

        // =========================
        // Bước 2: Dùng Fuse lọc TOP 5 internal khớp nhất
        // =========================
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
        const topInternal = fuseResults.slice(0, 5).map(r => r.item);

        console.log(`\n===== TOP 5 INTERNAL =====`);
        topInternal.forEach((doc, i) => {
            const score = Math.round((1 - fuseResults[i]?.score) * 100);
            console.log(`${i + 1}. ${doc.title} (độ khớp: ${score}%)`);
        });

        // =========================
        // Bước 3: Gọi Google Search lấy TOP 5 external
        // =========================
        const searchQuery = `${query} (giáo trình OR "bài giảng" OR "tài liệu học tập") cho sinh viên filetype:pdf`;
        let rawGoogleResults = await searchGoogle(searchQuery);

        // Lọc trùng URL và lấy TOP 5
        const uniqueGoogle = rawGoogleResults.filter(
            (item, index, self) => index === self.findIndex(x => x.url === item.url)
        );
        const topExternal = uniqueGoogle.slice(0, 5);

        console.log(`\n===== TOP 5 EXTERNAL =====`);
        topExternal.forEach((item, i) => {
            console.log(`${i + 1}. ${item.title}`);
        });

        // =========================
        // Bước 4: GỘP 5 internal + 5 external = 10 tài liệu
        // =========================
        const combinedDocs = {
            internal: topInternal,
            external: topExternal
        };

        // =========================
        // Bước 5: Xây dựng prompt gửi Gemini
        // =========================
        let prompt = `Bạn là trợ lý tìm kiếm tài liệu học tập.

CÂU HỎI: "${query}"

QUY TẮC QUAN TRỌNG:
1. Ưu tiên chọn tài liệu từ INTERNAL nếu phù hợp.
2. Nếu INTERNAL không có cái nào phù hợp, chọn từ EXTERNAL.
3. TUYỆT ĐỐI KHÔNG bịa URL, không tạo tài liệu mới.
4. Chọn tối đa 5 tài liệu.

`;

        if (topInternal.length > 0) {
            prompt += `\nDANH SÁCH TÀI LIỆU INTERNAL (ưu tiên chọn từ đây):\n`;
            prompt += topInternal.map((doc, idx) => `${idx + 1}.
ID: ${doc._id}
Tiêu đề: ${doc.title}
Môn học: ${doc.subject_id?.name || 'Chưa phân loại'}
Mô tả: ${doc.description || 'Không có mô tả'}`).join('\n');
        }

        if (topExternal.length > 0) {
            prompt += `\n\nDANH SÁCH TÀI LIỆU EXTERNAL (chỉ chọn nếu internal không phù hợp):\n`;
            prompt += topExternal.map((item, idx) => `${idx + 1}.
Tiêu đề: ${item.title}
URL: ${item.url}
Mô tả: ${item.snippet}`).join('\n');
        }

        prompt += `

TRẢ VỀ JSON DUY NHẤT (không kèm text khác):
{
  "answer": "câu trả lời bằng tiếng Việt, ngắn gọn",
  "documents": [
    {
      "id": "ID (nếu internal) hoặc null",
      "title": "tiêu đề tài liệu",
      "reason": "lý do chọn",
      "score": 90,
      "source": "internal hoặc external",
      "url": "url (nếu external)"
    }
  ]
}`;

        // =========================
        // Bước 6: Gọi Gemini
        // =========================
        let aiResponse = { answer: '', documents: [] };

        if (topInternal.length > 0 || topExternal.length > 0) {
            const geminiResponse = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
                { contents: [{ parts: [{ text: prompt }] }] }
            );

            let aiText = geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            aiText = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

            try {
                const jsonMatch = aiText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    aiResponse = JSON.parse(jsonMatch[0]);
                }
            } catch (error) {
                console.error('Parse Gemini JSON error:', error);
            }
        }

        // =========================
        // Bước 7: Build kết quả trả về client
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

            if (doc.source === 'external' && doc.url && topExternal.some(e => e.url === doc.url)) {
                externalDocs.push({
                    _id: `ext_${Date.now()}_${externalDocs.length}`,
                    title: doc.title,
                    description: doc.reason || 'Tài liệu tham khảo từ Google',
                    file_url: doc.url,
                    file_type: 'external',
                    source: 'external',
                    aiReason: doc.reason,
                    aiScore: doc.score,
                    subject_id: { name: '📡 Google Search' },
                    user_id: { name: 'Google' },
                    download_count: 0
                });
            }
        }

        let results = internalDocs.length > 0 ? internalDocs : externalDocs;

        // Fallback nếu Gemini không chọn được gì
        if (results.length === 0 && topExternal.length > 0) {
            results = topExternal.slice(0, 5).map((item, index) => ({
                _id: `fallback_${index}`,
                title: item.title,
                description: item.snippet,
                file_url: item.url,
                file_type: 'external',
                source: 'external',
                aiReason: 'Kết quả tìm kiếm phù hợp',
                aiScore: 70,
                subject_id: { name: '📡 Google Search' },
                user_id: { name: 'Google' },
                download_count: 0
            }));
        }

        let answer = aiResponse.answer;
        if (!answer) {
            if (internalDocs.length > 0) {
                answer = `📚 Tìm thấy ${internalDocs.length} tài liệu trong hệ thống.`;
            } else if (results.length > 0) {
                answer = `🔍 Không có tài liệu nội bộ phù hợp, hiển thị ${results.length} kết quả từ web.`;
            } else {
                answer = `😔 Không tìm thấy tài liệu phù hợp với "${query}".`;
            }
        }

        console.log(`\n===== KẾT QUẢ CUỐI =====`);
        console.log(`Internal chọn: ${internalDocs.length}`);
        console.log(`External chọn: ${externalDocs.length}`);
        console.log(`Tổng: ${results.length}`);

        return res.json({
            query,
            answer,
            results,
            count: results.length
        });

    } catch (err) {
        console.error('AI Search error:', err.response?.data || err.message);
        return res.status(500).json({
            query: req.body.query,
            answer: 'Có lỗi xảy ra, vui lòng thử lại sau.',
            results: [],
            count: 0
        });
    }
});

module.exports = router;