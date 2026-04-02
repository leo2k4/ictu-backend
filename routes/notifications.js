const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Notification = require('../models/Notifications');

// GET /api/notifications
router.get('/', auth, async (req, res) => {
    try {
        const notifications = await Notification.find({ user_id: req.user.id })
            .populate('sender_id', 'name')
            .populate('document_id', 'title')
            .populate('comment_id', 'content')
            .sort({ created_at: -1 });

        res.json(notifications);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi lấy thông báo' });
    }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', auth, async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);
        if (!notification) return res.status(404).json({ error: 'Không tìm thấy thông báo' });

        // Chỉ user nhận mới được đánh dấu
        if (notification.user_id.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Không có quyền' });
        }

        notification.is_read = true;
        await notification.save();

        res.json({ message: 'Đã đánh dấu đọc' });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi cập nhật thông báo' });
    }
});
module.exports = router;