const express = require('express');
const router = express.Router();

const Comment = require('../models/Comment');
const auth = require('../middleware/auth');

// POST comment
router.post('/:documentId/comments', auth, async (req, res) => {
    try {
        const { content } = req.body;

        if (!content?.trim()) {
            return res.status(400).json({ error: 'Nội dung bình luận không được rỗng' });
        }

        const comment = new Comment({
            content,
            user: req.user.id,
            document: req.params.documentId,
        });

        await comment.save();

        res.status(201).json({
            message: 'Bình luận thành công',
            comment
        });

    } catch (err) {
        res.status(500).json({ error: 'Lỗi khi thêm bình luận' });
    }
});


// GET list comment
router.get('/:documentId/comments', async (req, res) => {
    try {
        const comments = await Comment.find({
            document: req.params.documentId
        })
            .populate('user', 'name')
            .sort({ created_at: -1 });

        res.json(comments);

    } catch (err) {
        res.status(500).json({ error: 'Lỗi khi lấy bình luận' });
    }
});

// PUT sửa bình luận (chỉ owner)
router.put('/:documentId/comments/:commentId', auth, async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.commentId);
        if (!comment) return res.status(404).json({ error: 'Bình luận không tồn tại' });

        if (comment.user.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Bạn không phải người tạo bình luận này' });
        }

        comment.content = req.body.content?.trim();
        if (!comment.content) return res.status(400).json({ error: 'Nội dung không được rỗng' });

        await comment.save();

        res.json({ message: 'Sửa bình luận thành công', comment });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi khi sửa bình luận' });
    }
});

// DELETE xóa bình luận (chỉ owner hoặc admin)
router.delete('/:documentId/comments/:commentId', auth, async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.commentId);
        if (!comment) return res.status(404).json({ error: 'Bình luận không tồn tại' });

        if (comment.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Bạn không có quyền xóa bình luận này' });
        }

        await comment.deleteOne();

        res.json({ message: 'Xóa bình luận thành công' });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi khi xóa bình luận' });
    }
});

module.exports = router;