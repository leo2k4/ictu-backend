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
        console.error('REPORT ERROR:', err);
        res.status(500).json({ error: 'Lỗi hệ thống' });
    }
});

module.exports = router;