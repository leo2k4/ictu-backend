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
router.get('/test', verifyToken, isAdmin, (req, res) => {
    res.json({ message: 'Admin OK' });
});

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

module.exports = router;