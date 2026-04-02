const express = require('express');
const router = express.Router();

const Notification = require('../models/Notifications');
const Document = require('../models/Document');

const Comment = require('../models/Comment');
const auth = require('../middleware/auth');


// ================= CREATE COMMENT / REPLY =================
router.post('/:documentId/comments', auth, async (req, res) => {
    try {
        const { content, parent_id } = req.body;

        if (!content?.trim()) {
            return res.status(400).json({ error: 'Nội dung không được rỗng' });
        }

        const comment = new Comment({
            content: content.trim(),
            user_id: req.user.id,
            document_id: req.params.documentId,
            parent_id: parent_id || null
        });

        await comment.save();

        // ====== TẠO NOTIFICATION ======
        const document = await Document.findById(req.params.documentId);

        try {
            const document = await Document.findById(req.params.documentId);

            if (document && document.user_id.toString() !== req.user.id) {
                await Notification.create({
                    user_id: document.user_id,
                    sender_id: req.user.id,
                    type: "COMMENT",
                    document_id: document._id,
                    comment_id: comment._id
                });
            }
        } catch (err) {
            console.error("Notification error:", err.message);
        }

        res.status(201).json({
            message: 'Bình luận thành công',
            comment
        });

    } catch (err) {
        res.status(500).json({ error: 'Lỗi khi thêm bình luận' });
    }
});


// ================= GET COMMENTS (TREE BASIC) =================
router.get('/:documentId/comments', async (req, res) => {
    try {
        const { documentId } = req.params;

        // lấy comment gốc
        const parents = await Comment.find({
            document_id: documentId,
            parent_id: null
        })
            .populate('user_id', 'name')
            .sort({ created_at: -1 });

        // lấy replies
        const replies = await Comment.find({
            document_id: documentId,
            parent_id: { $ne: null }
        }).populate('user_id', 'name');

        // map reply vào parent
        const map = {};
        replies.forEach(r => {
            const key = r.parent_id.toString();
            if (!map[key]) map[key] = [];
            map[key].push(r);
        });

        const result = parents.map(p => ({
            ...p.toObject(),
            replies: map[p._id] || []
        }));

        res.json(result);

    } catch (err) {
        res.status(500).json({ error: 'Lỗi khi lấy bình luận' });
    }
});


// ================= UPDATE COMMENT =================
router.put('/:documentId/comments/:commentId', auth, async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.commentId);

        if (!comment) {
            return res.status(404).json({ error: 'Không tồn tại' });
        }

        if (comment.user_id.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Không có quyền sửa' });
        }

        const newContent = req.body.content?.trim();
        if (!newContent) {
            return res.status(400).json({ error: 'Nội dung không hợp lệ' });
        }

        comment.content = newContent;
        await comment.save();

        res.json({ message: 'Đã cập nhật', comment });

    } catch (err) {
        res.status(500).json({ error: 'Lỗi khi sửa bình luận' });
    }
});


// ================= DELETE COMMENT =================
router.delete('/:documentId/comments/:commentId', auth, async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.commentId);

        if (!comment) {
            return res.status(404).json({ error: 'Không tồn tại' });
        }

        if (
            comment.user_id.toString() !== req.user.id &&
            req.user.role !== 'admin'
        ) {
            return res.status(403).json({ error: 'Không có quyền xóa' });
        }

        // kiểm tra có reply không
        const hasReplies = await Comment.exists({ parent_id: comment._id });

        if (hasReplies) {
            // soft delete
            comment.content = '[Đã xóa]';
            await comment.save();
        } else {
            await comment.deleteOne();
        }

        res.json({ message: 'Đã xóa bình luận' });

    } catch (err) {
        res.status(500).json({ error: 'Lỗi khi xóa bình luận' });
    }
});

module.exports = router;