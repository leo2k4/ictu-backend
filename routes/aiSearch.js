const express = require('express');
const axios = require('axios');
const router = express.Router();
const Fuse = require('fuse.js');

const Document = require('../models/Document');
const searchGoogle = require('../services/googleSearch');

// Hàm loại bỏ dấu tiếng Việt
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

        console.log("\n================ SEARCH START ================");
        console.log("QUERY:", query);

        if (!query?.trim()) {
            console.log("❌ Missing query");
            return res.status(400).json({ message: 'Thiếu câu hỏi' });
        }

        // =========================
        // 1. LẤY TOÀN BỘ TÀI LIỆU NỘI BỘ
        // =========================
        const allDocuments = await Document.find({ status: 'approved' })
            .populate('subject_id', 'name')
            .limit(50);

        console.log("\n===== ALL INTERNAL DOCS =====");
        console.log("Total:", allDocuments.length);

        // =========================
        // 2. TÍNH ĐIỂM LIÊN QUAN BẰNG FUSE.JS
        // =========================
        const normalizedQuery = removeAccents(query);

        const docsForFuse = allDocuments.map(doc => ({
            ...doc.toObject(),
            _searchTitle: removeAccents(doc.title || ''),
            _searchDesc: removeAccents(doc.description || ''),
            _searchSubject: removeAccents(doc.subject_id?.name || ''),
        }));

        const fuseOptions = {
            keys: [
                { name: '_searchTitle', weight: 0.7 },
                { name: '_searchDesc', weight: 0.2 },
                { name: '_searchSubject', weight: 0.1 },
            ],
            threshold: 0.4,
            distance: 100,
            ignoreLocation: true,
            minMatchCharLength: 2,
        };

        const fuse = new Fuse(docsForFuse, fuseOptions);
        const fuseResults = fuse.search(normalizedQuery);
        const topDocuments = fuseResults.slice(0, 5).map(r => r.item);

        console.log("\n===== TOP RELEVANT DOCS =====");
        console.log("Count:", topDocuments.length);
        topDocuments.forEach((doc, i) => {
            const score = Math.round((1 - fuseResults[i]?.score) * 100);
            console.log(`${i + 1}. ${doc.title} (độ liên quan: ${score}%)`);
        });

        // =========================
        // 3. GOOGLE SEARCH (CHỈ KHI KHÔNG CÓ TÀI LIỆU NỘI BỘ)
        // =========================
        let googleResults = [];

        if (topDocuments.length === 0) {
            console.log("\n⚠️ Không có tài liệu nội bộ, gọi Google Search...");

            // Từ khóa đại học để lọc trình độ
            const uniKeywords = ["đại học", "cao đẳng", "university", "college", "sinh viên"];
            const hasUniKeyword = uniKeywords.some(kw => query.toLowerCase().includes(kw));

            // Xây dựng query thông minh
            let smartQuery = `"${query}" tài liệu filetype:pdf OR filetype:doc OR filetype:docx`;

            if (!hasUniKeyword) {
                smartQuery = `${smartQuery} đại học sinh viên`;
            }

            // Loại trừ kết quả cấp 1-2-3
            const excludePatterns = ["lớp 1", "lớp 2", "lớp 3", "lớp 4", "lớp 5", "tiểu học", "THCS", "THPT", "cấp 1", "cấp 2", "cấp 3"];
            const excludePart = excludePatterns.map(kw => `-"${kw}"`).join(' ');
            smartQuery = `${smartQuery} ${excludePart}`;

            console.log("\n===== GOOGLE QUERY =====");
            console.log(smartQuery);
            console.log("=========================");

            try {
                googleResults = await searchGoogle(smartQuery);
                console.log("Raw results count:", googleResults?.length || 0);

                // Hậu lọc kết quả
                const filteredResults = googleResults.filter(item => {
                    const title = (item.title || "").toLowerCase();
                    const snippet = (item.snippet || "").toLowerCase();
                    const isPrimary = excludePatterns.some(p => title.includes(p) || snippet.includes(p));
                    return !isPrimary;
                });

                googleResults = filteredResults.slice(0, 15);
                console.log("After filter:", googleResults.length);
            } catch (err) {
                console.log("❌ Google error:", err.message);
            }
        } else {
            console.log("\n✅ Có tài liệu nội bộ, KHÔNG gọi Google");
        }

        // =========================
        // 4. GEMINI PROMPT (CHỈ GỬI TOP 5 TÀI LIỆU)
        // =========================
        const prompt = `Bạn là trợ lý tìm kiếm tài liệu học tập cho sinh viên đại học.

**QUAN TRỌNG: Trả về DUY NHẤT object JSON, không kèm text khác.**

FORMAT JSON:
{
  "answer": "Câu trả lời bằng tiếng Việt, ngắn gọn",
  "documents": [
    {
      "source": "internal",
      "id": "ID",
      "reason": "Lý do chọn",
      "score": 0.95
    }
  ]
}

INTERNAL DOCUMENTS:
${topDocuments.map((doc, idx) => `${idx + 1}.
ID: ${doc._id}
Tiêu đề: ${doc.title}
Môn: ${doc.subject_id?.name || 'N/A'}
Mô tả: ${doc.description || 'Không có'}`).join('\n')}

${googleResults.length > 0 ? `GOOGLE RESULTS (dùng nếu không có internal phù hợp):
${googleResults.map((item, idx) => `${idx + 1}.
Title: ${item.title}
URL: ${item.url}
Snippet: ${item.snippet}`).join('\n')}` : ''}

CÂU HỎI: "${query}"

HƯỚNG DẪN:
- Ưu tiên tài liệu nội bộ nếu phù hợp
- Nếu không có nội bộ, dùng Google results
- Chỉ chọn 2-3 tài liệu phù hợp nhất

Trả về JSON DUY NHẤT.`;

        if (topDocuments.length === 0 && googleResults.length === 0) {
            return res.json({
                query,
                answer: "Không tìm thấy tài liệu phù hợp. Vui lòng thử từ khóa khác.",
                results: [],
                count: 0
            });
        }

        const geminiResponse = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            { contents: [{ parts: [{ text: prompt }] }] }
        );

        const aiText = geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        console.log("\n===== GEMINI RAW =====", aiText);

        let aiResponse = { answer: '', documents: [] };
        try {
            const jsonMatch = aiText.match(/\{[\s\S]*\}/);
            if (jsonMatch) aiResponse = JSON.parse(jsonMatch[0]);
        } catch (error) {
            console.log("❌ Parse error:", error.message);
        }

        // =========================
        // 5. BUILD KẾT QUẢ
        // =========================
        const internalDocs = [];
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
        }

        let results = internalDocs;
        if (results.length === 0 && googleResults.length > 0) {
            results = googleResults.slice(0, 5).map((item, index) => ({
                _id: `google_${index}`,
                title: item.title,
                description: item.snippet,
                file_url: item.url,
                file_type: 'external',
                source: 'external',
                subject_id: { name: 'Web' },
                user_id: { name: 'Google' },
                download_count: 0
            }));
        }

        let answer = aiResponse.answer;
        if (!answer) {
            if (internalDocs.length > 0) answer = `📚 Tìm thấy ${internalDocs.length} tài liệu phù hợp.`;
            else if (results.length > 0) answer = `🔍 Hiển thị ${results.length} kết quả từ web.`;
            else answer = `❌ Không tìm thấy tài liệu phù hợp.`;
        }

        console.log("\n===== FINAL =====");
        console.log("Internal results:", internalDocs.length);
        console.log("Total results:", results.length);

        return res.json({ query, answer, results, count: results.length });

    } catch (err) {
        console.log("❌ SEARCH ERROR:", err?.response?.data || err.message);
        return res.status(500).json({
            query: req.body.query,
            answer: 'Có lỗi xảy ra, vui lòng thử lại sau',
            results: [],
            count: 0
        });
    }
});

module.exports = router;