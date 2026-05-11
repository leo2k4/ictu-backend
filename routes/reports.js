const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const Report = require('../models/Report');
const Document = require('../models/Document');
const Notification = require('../models/Notifications');


//POST /api/reports/:documentId
router.post('/:documentId', auth, async (req, res) => {
    try {
        const { reason, description } = req.body;
        const documentId = req.params.documentId;

        const validReasons = [
            'SPAM',
            'COPYRIGHT',
            'WRONG_CONTENT',
            'INAPPROPRIATE',
            'OTHER'
        ];

        if (!reason) {
            return res.status(400).json({ error: 'Thiếu lý do báo cáo' });
        }

        if (!validReasons.includes(reason)) {
            return res.status(400).json({ error: 'Lý do không hợp lệ' });
        }

        if (reason === 'OTHER' && (!description || !description.trim())) {
            return res.status(400).json({ error: 'Vui lòng nhập mô tả cho lý do OTHER' });
        }


        const doc = await Document.findById(documentId);
        if (!doc) {
            return res.status(404).json({ error: 'Tài liệu không tồn tại' });
        }

        const existing = await Report.findOne({
            user_id: req.user.id,
            document_id: documentId
        });

        if (existing) {
            return res.status(409).json({
                error: 'Bạn đã báo cáo tài liệu này rồi'
            });
        }

        const report = new Report({
            user_id: req.user.id,
            document_id: documentId,
            reason,
            description: description || ''
        });

        await report.save();

        await Notification.create({
            user_id: req.user.id,
            sender_id: req.user.id,
            type: "REPORT_SUBMITTED",
            document_id: documentId,
            is_read: false
        });

        res.status(201).json({
            message: 'Báo cáo đã được gửi',
            report
        });

    } catch (err) {
        console.error("🔥 REPORT ERROR FULL:", err);
        res.status(500).json({ error: err.message });
    }
});

router.patch('/:id/resolve', auth, async (req, res) => {
    try {
        const { action, reason } = req.body;

        if (!['hidden', 'removed'].includes(action)) {
            return res.status(400).json({
                error: 'Action không hợp lệ'
            });
        }

        const report = await Report.findById(req.params.id);
        if (!report) {
            return res.status(404).json({
                error: 'Không tìm thấy report'
            });
        }

        const document = await Document.findById(report.document_id);
        if (!document) {
            return res.status(404).json({
                error: 'Không tìm thấy document'
            });
        }

        // 1. update document
        document.status = action;
        await document.save();

        // 2. update report
        report.status = 'RESOLVED';
        await report.save();

        // 3. tạo notification cho chủ bài viết
        await Notification.create({
            user_id: document.user_id,
            sender_id: req.user.id,
            type: action === 'hidden'
                ? 'DOCUMENT_HIDDEN'
                : 'DOCUMENT_REMOVED',
            document_id: document._id,
            reason: reason
        });

        return res.json({
            message: 'Xử lý report thành công'
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            error: 'Lỗi server'
        });
    }
});
module.exports = router;