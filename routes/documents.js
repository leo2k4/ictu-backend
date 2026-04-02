const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const auth = require('../middleware/auth');
const Document = require('../models/Document');
const Favorite = require('../models/Favorite');
const Notification = require('../models/Notifications');
const router = express.Router();

// ================= CLOUDINARY =================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'ictu-documents',
        resource_type: 'auto',
    },
});

const upload = multer({ storage });

// ================= UPLOAD =================
router.post('/upload', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file được upload' });
        }

        const { title, description, tags, subject_id } = req.body;

        if (!subject_id) {
            return res.status(400).json({ error: 'Thiếu subject_id' });
        }

        const subjectObjectId = new mongoose.Types.ObjectId(subject_id);

        const document = new Document({
            title,
            description,
            file_url: req.file.path,
            file_type: req.file.mimetype,
            file_size: req.file.size,
            user_id: req.user.id,
            subject_id: subjectObjectId,
            tags: tags ? tags.split(',').map(t => t.trim()) : [],
        });

        await document.save();

        res.status(201).json({
            message: 'Upload tài liệu thành công',
            document,
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi khi upload' });
    }
});


// ================= LIST DOCUMENT =================
router.get('/', async (req, res) => {
    try {
        const documents = await Document.find({ status: 'approved' })
            .populate('user_id', 'name email')
            .populate('subject_id', 'name code');

        res.json(documents);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi khi lấy danh sách' });
    }
});


// ================= TOGGLE FAVORITE =================
router.post('/:documentId/favorite', auth, async (req, res) => {
    try {
        const filter = {
            user_id: req.user.id,
            document_id: req.params.documentId,
        };

        const existing = await Favorite.findOne(filter);

        if (existing) {
            await Favorite.deleteOne({ _id: existing._id });
            return res.json({ message: 'Đã bỏ yêu thích', isFavorite: false });
        }

        // Tạo favorite mới
        await Favorite.create(filter);

        // Lấy document để biết owner
        const doc = await Document.findById(req.params.documentId);
        if (doc) {
            // Tạo notification chỉ khi người tim không phải owner
            if (doc.user_id.toString() !== req.user.id) {
                await Notification.create({
                    user_id: doc.user_id,
                    sender_id: req.user.id,
                    type: "LIKE",
                    document_id: doc._id,
                    is_read: false,
                });
            }
        }

        res.json({ message: 'Đã thêm vào yêu thích', isFavorite: true });

    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Đã tồn tại trong favorites' });
        }
        res.status(500).json({ error: 'Lỗi khi cập nhật yêu thích' });
    }
});


// ================= CHECK FAVORITE =================
router.get('/:documentId/favorite/status', auth, async (req, res) => {
    try {
        const favorite = await Favorite.findOne({
            user_id: req.user.id,
            document_id: req.params.documentId,
        });

        res.json({ isFavorite: !!favorite });

    } catch (err) {
        res.status(500).json({ error: 'Lỗi kiểm tra trạng thái yêu thích' });
    }
});


// ================= LIST FAVORITES =================
router.get('/favorites', auth, async (req, res) => {
    try {
        const favorites = await Favorite.find({ user_id: req.user.id })
            .populate({
                path: 'document_id',
                select: 'title description file_url download_count upload_date user_id',
                populate: {
                    path: 'user_id',
                    select: 'name'
                }
            })
            .sort({ created_at: -1 });

        // trả về list document
        res.json(favorites.map(f => f.document_id));

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi khi lấy danh sách yêu thích' });
    }
});

router.get('/my-documents', auth, async (req, res) => {
    try {
        const docs = await Document.find({ user_id: req.user.id })
            .populate('subject_id', 'name')
            .sort({ createdAt: -1 });

        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi lấy tài liệu của bạn' });
    }
});

// ================= DELETE DOCUMENT =================
router.delete('/:id', auth, async (req, res) => {
    try {
        const doc = await Document.findById(req.params.id);

        if (!doc) {
            return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
        }

        // Chỉ cho phép xóa của chính user
        if (doc.user_id.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Không có quyền xóa tài liệu này' });
        }

        // ===== XÓA TẤT CẢ FAVORITES liên quan đến document này =====
        await Favorite.deleteMany({ document_id: req.params.id });

        // ===== Xóa file trên Cloudinary =====
        if (doc.file_url) {
            try {
                const urlParts = doc.file_url.split('/');
                const publicId = `ictu-documents/${urlParts[urlParts.length - 1].split('.')[0]}`;
                await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
            } catch (err) {
                console.error('Lỗi xóa file Cloudinary:', err);
            }
        }

        // ===== Xóa document trên DB =====
        await doc.deleteOne();

        res.json({ message: 'Xóa tài liệu thành công và đã xóa khỏi yêu thích của mọi người' });

    } catch (err) {
        console.error('Xóa tài liệu lỗi:', err);
        res.status(500).json({ error: 'Xóa tài liệu thất bại' });
    }
});

module.exports = router;