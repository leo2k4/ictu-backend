const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');

const User = require('../models/User');
const Document = require('../models/Document');
const Comment = require('../models/Comment');

// console.log('AUTH:', auth);
// console.log('verifyToken:', typeof auth.verifyToken);
// console.log('isAdmin:', typeof auth.isAdmin);

const { verifyToken, isAdmin } = auth;

// test trước
// router.get('/test', verifyToken, isAdmin, (req, res) => {
//     res.json({ message: 'Admin OK' });
// });

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
router.get('/documents/pending', verifyToken, isAdmin, async (req, res) => {
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
router.patch('/documents/:id/approve', verifyToken, isAdmin, async (req, res) => {
    try {
        const doc = await Document.findByIdAndUpdate(req.params.id, { status: 'approved' }, { new: true });
        res.json(doc);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /admin/documents/:id/reject
router.patch('/documents/:id/reject', verifyToken, isAdmin, async (req, res) => {
    try {
        const doc = await Document.findByIdAndUpdate(req.params.id, { status: 'rejected' }, { new: true });
        res.json(doc);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /admin/documents
router.get('/documents', verifyToken, isAdmin, async (req, res) => {
    try {
        const docs = await Document.find()
            .populate('user_id', 'name email')
            .populate('subject_id', 'name')
            .sort({ upload_date: -1 });
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /admin/users
router.get('/users', verifyToken, isAdmin, async (req, res) => {
    const users = await User.find().select('-password_hash').sort({ createdAt: -1 });
    res.json(users);
});

// GET /admin/comments
router.get('/comments', verifyToken, isAdmin, async (req, res) => {
    const comments = await Comment.find()
        .populate('user_id', 'name')
        .populate('document_id', 'title')
        .sort({ createdAt: -1 });
    res.json(comments);
});

// DELETE /admin/comments/:id
router.delete('/comments/:id', verifyToken, isAdmin, async (req, res) => {
    await Comment.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

module.exports = router;