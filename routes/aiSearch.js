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
            return res.status(400).json({ message: 'Thiếu câu hỏi' });
        }

        // =========================
        // 1. LẤY TÀI LIỆU NỘI BỘ
        // =========================
        const allDocuments = await Document.find({ status: 'approved' })
            .populate('subject_id', 'name')
            .limit(50);

        console.log("\n===== ALL INTERNAL DOCS =====");
        console.log("Total:", allDocuments.length);

        // =========================
        // 2. DÙNG FUSE.JS TÌM KIẾM
        // =========================
        const normalizedQuery = removeAccents(query);

        // Tách từ khóa quan trọng (bỏ các từ phổ biến)
        const stopWords = ['đề', 'bài', 'ôn', 'tập', 'và', 'của', 'cho', 'với', 'môn'];
        const queryWords = normalizedQuery.split(' ').filter(w => w.length > 1 && !stopWords.includes(w));

        console.log("Keywords:", queryWords);

        const docsForFuse = allDocuments.map(doc => ({
            ...doc.toObject(),
            _searchTitle: removeAccents(doc.title || ''),
            _searchDesc: removeAccents(doc.description || ''),
            _searchSubject: removeAccents(doc.subject_id?.name || ''),
        }));

        const fuseOptions = {
            keys: [
                { name: '_searchTitle', weight: 0.7 },
                { name: '_searchSubject', weight: 0.3 },
            ],
            threshold: 0.35,  // Giảm threshold để khớp chính xác hơn
            ignoreLocation: true,
            minMatchCharLength: 2,
        };

        const fuse = new Fuse(docsForFuse, fuseOptions);
        const fuseResults = fuse.search(normalizedQuery);

        // Lọc kết quả phải có ít nhất 1 từ khóa quan trọng trùng
        let relevantDocs = fuseResults.filter(result => {
            const title = result.item._searchTitle;
            const subject = result.item._searchSubject;

            // Kiểm tra có từ khóa nào xuất hiện không
            const hasKeyword = queryWords.some(kw =>
                title.includes(kw) || subject.includes(kw)
            );

            // Độ liên quan > 40%
            const relevance = 1 - result.score;

            return hasKeyword && relevance > 0.4;
        });

        // Lấy TOP 5
        const topDocuments = relevantDocs.slice(0, 5).map(r => r.item);

        console.log("\n===== TOP RELEVANT DOCS =====");
        console.log("Count:", topDocuments.length);
        topDocuments.forEach((doc, i) => {
            const score = Math.round((1 - relevantDocs[i]?.score) * 100);
            console.log(`${i + 1}. ${doc.title} (độ liên quan: ${score}%)`);
        });

        // =========================
        // 3. GOOGLE SEARCH - TỐI ƯU THEO LOẠI TÀI LIỆU
        // =========================
        let googleResults = [];

        // Xác định người dùng đang tìm gì
        let searchType = "tài liệu học tập";
        if (query.toLowerCase().includes("đề") || query.toLowerCase().includes("kiểm tra") || query.toLowerCase().includes("thi")) {
            searchType = "đề thi đề kiểm tra";
        } else if (query.toLowerCase().includes("giáo trình")) {
            searchType = "giáo trình bài giảng";
        }

        // QUAN TRỌNG: CHỈ GỌI GOOGLE KHI KHÔNG CÓ TÀI LIỆU NỘI BỘ LIÊN QUAN
        if (topDocuments.length === 0) {
            console.log("\n⚠️ Không có tài liệu nội bộ liên quan, gọi Google Search...");

            // Query phù hợp với nhu cầu tìm đề
            let smartQuery = `"${query}" ${searchType} filetype:pdf sinh viên đại học`;

            console.log("===== GOOGLE QUERY =====");
            console.log(smartQuery);

            try {
                googleResults = await searchGoogle(smartQuery);
                console.log("Results count:", googleResults?.length || 0);
            } catch (err) {
                console.log("❌ Google error:", err.message);
            }

            googleResults = googleResults.slice(0, 15);
        } else {
            console.log("\n✅ Có ${topDocuments.length} tài liệu nội bộ liên quan, KHÔNG gọi Google");
        }

        // =========================
        // 4. NẾU CÓ TÀI LIỆU NỘI BỘ HOẶC GOOGLE -> GỬI GEMINI
        // =========================
        let finalResults = [];
        let answerText = "";

        if (topDocuments.length > 0) {
            // Có tài liệu nội bộ, gửi Gemini chọn lọc
            const prompt = `Bạn là trợ lý tìm kiếm tài liệu học tập cho sinh viên đại học.

QUAN TRỌNG: Trả về DUY NHẤT JSON, không text khác.

JSON format:
{
  "answer": "Câu trả lời ngắn gọn bằng tiếng Việt",
  "documents": [
    {
      "source": "internal",
      "id": "ID",
      "reason": "Lý do chọn"
    }
  ]
}

DANH SÁCH TÀI LIỆU NỘI BỘ:
${topDocuments.map((doc, idx) => `${idx + 1}.
ID: ${doc._id}
Tiêu đề: ${doc.title}
Môn: ${doc.subject_id?.name || 'N/A'}`).join('\n')}

CÂU HỎI: "${query}"

HƯỚNG DẪN:
- Chọn 2-3 tài liệu phù hợp nhất với câu hỏi
- Nếu không có tài liệu nào phù hợp, trả documents: []
- Trả JSON duy nhất`;

            const geminiResponse = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
                {
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1 }
                }
            );

            let aiText = geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            aiText = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

            console.log("\n===== GEMINI RAW =====");
            console.log(aiText);

            let aiResponse = { answer: '', documents: [] };
            try {
                const jsonMatch = aiText.match(/\{[\s\S]*\}/);
                if (jsonMatch) aiResponse = JSON.parse(jsonMatch[0]);
            } catch (error) {
                console.log("❌ Parse error:", error.message);
            }

            answerText = aiResponse.answer;

            // Lấy thông tin đầy đủ của các tài liệu được chọn
            for (const doc of aiResponse.documents || []) {
                if (doc.source === 'internal' && doc.id) {
                    const fullDoc = await Document.findById(doc.id)
                        .populate('subject_id', 'name')
                        .populate('user_id', 'name');
                    if (fullDoc) {
                        finalResults.push({
                            ...fullDoc.toObject(),
                            aiReason: doc.reason,
                            source: 'internal'
                        });
                    }
                }
            }
        }

        // Nếu không có internal nào được chọn, dùng Google
        if (finalResults.length === 0 && googleResults.length > 0) {
            finalResults = googleResults.slice(0, 5).map((item, index) => ({
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
            answerText = `🔍 Không có tài liệu nội bộ phù hợp, hiển thị ${finalResults.length} kết quả từ web.`;
        }

        if (!answerText) {
            if (finalResults.length > 0) {
                answerText = `📚 Tìm thấy ${finalResults.length} tài liệu phù hợp.`;
            } else {
                answerText = `❌ Không tìm thấy tài liệu phù hợp với "${query}".`;
            }
        }

        console.log("\n===== FINAL =====");
        console.log("Internal results:", finalResults.filter(r => r.source === 'internal').length);
        console.log("Total results:", finalResults.length);

        return res.json({
            query,
            answer: answerText,
            results: finalResults,
            count: finalResults.length
        });

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