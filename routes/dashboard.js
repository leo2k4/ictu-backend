const express = require('express');
const router = express.Router();
const Document = require('../models/Document');
const User = require('../models/User');

router.get('/summary', async (req, res) => {
    try {
        const totalDocs = await Document.countDocuments({ status: 'approved' });

        const totalStudents = await User.countDocuments({ role: 'student' });

        const downloadsAgg = await Document.aggregate([
            { $group: { _id: null, total: { $sum: "$download_count" } } }
        ]);

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