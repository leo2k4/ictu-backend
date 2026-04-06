const express = require('express');
const router = express.Router();
const Document = require('../models/Document');
const User = require('../models/User');

router.get('/summary', async (req, res) => {
    try {
        // 1. Tổng số tài liệu toàn hệ thống
        const totalDocs = await Document.countDocuments({ status: 'approved' });

        // 2. Tổng số sinh viên (user có role là student)
        const totalStudents = await User.countDocuments({ role: 'student' });

        // 3. Tổng lượt tải (Sum của field download_count)
        const downloadsAgg = await Document.aggregate([
            { $group: { _id: null, total: { $sum: "$download_count" } } }
        ]);

        // 4. Lấy 5 tài liệu mới nhất kèm thông tin môn học và người đăng
        const latestDocs = await Document.find({ status: 'approved' })
            .sort({ upload_date: -1 })
            .limit(5)
            .populate('user_id', 'name avatar_url')
            .populate('subject_id', 'name');

        res.json({
            stats: {
                totalDocs,
                totalStudents,
                totalDownloads: downloadsAgg[0]?.total || 0
            },
            latestDocs
        });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi lấy dữ liệu dashboard' });
    }
});

module.exports = router;