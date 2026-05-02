const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');

const User = require('../models/User');
const Document = require('../models/Document');
const Comment = require('../models/Comment');
const Report = require('../models/Report');
const Notification = require('../models/Notifications');

const { verifyToken, isAdmin, isAdminOrTeacher } = auth;





router.get('/stats', verifyToken, isAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalDocuments = await Document.countDocuments();
        const pendingDocuments = await Document.countDocuments({ status: 'pending' });
        const totalComments = await Comment.countDocuments();

        res.json({
            totalUsers,
            totalDocuments,
            pendingDocuments,
            totalComments
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /admin/documents/pending
router.get('/documents/pending', verifyToken, isAdminOrTeacher, async (req, res) => {
    try {
        const pendingDocs = await Document.find({ status: 'pending' })
            .populate('user_id', 'name email')
            .sort({ upload_date: -1 });
        res.json(pendingDocs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /admin/documents/:id/approve
router.patch('/documents/:id/approve', verifyToken, isAdminOrTeacher, async (req, res) => {
    try {
        const doc = await Document.findByIdAndUpdate(req.params.id, { status: 'approved' }, { new: true });
        res.json(doc);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /admin/documents/:id/reject
router.patch('/documents/:id/reject', verifyToken, isAdminOrTeacher, async (req, res) => {
    try {
        const doc = await Document.findByIdAndUpdate(req.params.id, { status: 'rejected' }, { new: true });
        res.json(doc);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /admin/documents 
router.get('/documents', verifyToken, isAdminOrTeacher, async (req, res) => {
    try {
        const { status, keyword } = req.query;

        let query = {};


        if (status && status !== 'all') {
            query.status = status;
        }

        if (keyword) {
            query.title = { $regex: keyword, $options: 'i' };
        }

        const docs = await Document.find(query)
            .populate('user_id', 'name email')
            .populate('subject_id', 'name')
            .sort({ upload_date: -1 });

        res.json(docs);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /admin/documents/:id
router.delete('/documents/:id', verifyToken, isAdminOrTeacher, async (req, res) => {
    try {
        const doc = await Document.findByIdAndDelete(req.params.id);

        if (!doc) {
            return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
        }

        res.json({ message: 'Đã xóa tài liệu' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /admin/users
router.get('/users', verifyToken, isAdmin, async (req, res) => {
    try {
        const { keyword, role } = req.query;

        let query = {};

        if (role && role !== 'all') {
            query.role = role;
        }

        if (keyword) {
            query.$or = [
                { name: { $regex: keyword, $options: 'i' } },
                { email: { $regex: keyword, $options: 'i' } }
            ];
        }

        const users = await User.find(query)
            .select('-password_hash')
            .sort({ created_at: -1 });

        res.json(users);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// PATCH /admin/users/:id/role  
router.patch('/users/:id/role', verifyToken, isAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        if (!['student', 'teacher', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Role không hợp lệ' });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { role },
            { new: true, select: '-password_hash' }
        );

        if (!user) return res.status(404).json({ error: 'Không tìm thấy user' });

        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// PATCH /admin/users/:id/block 
router.patch('/users/:id/block', verifyToken, isAdmin, async (req, res) => {
    try {
        const { blocked } = req.body;
        if (typeof blocked !== 'boolean') {
            return res.status(400).json({ error: 'Giá trị blocked phải là boolean' });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { blocked },
            { new: true, select: '-password_hash' }
        );

        if (!user) return res.status(404).json({ error: 'Không tìm thấy user' });

        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /admin/comments
router.get('/comments', verifyToken, isAdminOrTeacher, async (req, res) => {
    const comments = await Comment.find()
        .populate('user_id', 'name email')
        .populate('document_id', 'title')
        .sort({ createdAt: -1 });
    res.json(comments);
});

// DELETE /admin/comments/:id
router.delete('/comments/:id', verifyToken, isAdminOrTeacher, async (req, res) => {
    await Comment.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

router.get('/reports', verifyToken, isAdminOrTeacher, async (req, res) => {
    try {
        const reports = await Report.find()
            .populate('user_id', 'name email')
            .populate('document_id', 'title')
            .sort({ createdAt: -1 });

        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/reports/:id/resolve', verifyToken, isAdminOrTeacher, async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);

        if (!report) {
            return res.status(404).json({ error: 'Không tìm thấy report' });
        }

        if (report.status !== 'PENDING') {
            return res.status(400).json({
                error: 'Report đã được xử lý trước đó'
            });
        }

        report.status = 'RESOLVED';
        await report.save();

        await Notification.create({
            user_id: report.user_id,
            sender_id: req.user.id,
            type: 'REPORT_RESOLVED',
            document_id: report.document_id,
            is_read: false
        });

        res.json(report);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/reports/:id/reject', verifyToken, isAdminOrTeacher, async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);

        if (!report) {
            return res.status(404).json({ error: 'Không tìm thấy report' });
        }

        if (report.status !== 'PENDING') {
            return res.status(400).json({
                error: 'Report đã được xử lý trước đó'
            });
        }

        report.status = 'REJECTED';
        await report.save();

        await Notification.create({
            user_id: report.user_id,
            sender_id: req.user.id,
            type: 'REPORT_REJECTED',
            document_id: report.document_id,
            is_read: false
        });

        res.json(report);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;