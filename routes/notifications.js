const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Notification = require('../models/Notifications');

// Lấy tất cả notifications của user
router.get('/', auth, async (req, res) => {
    try {
        const notifications = await Notification.find({ user_id: req.user.id })
            .populate('sender_id', 'name avatar_url')  // thông tin người gửi
            .populate('document_id', 'title')         // thông tin document
            .populate('comment_id', 'content')        // nội dung comment nếu có
            .sort({ created_at: -1 });

        res.json(notifications);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi khi lấy notifications' });
    }
});

module.exports = router;