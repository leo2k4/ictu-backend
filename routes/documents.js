const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const auth = require('../middleware/auth');
const Document = require('../models/Document');
const Favorite = require('../models/Favorite');


const router = express.Router();

// Config Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage cho Multer
const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'ictu-documents',
        resource_type: 'auto',
    },
});

const upload = multer({ storage: storage });

// API upload tài liệu (bảo vệ bằng JWT)
router.post('/upload', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file được upload' });
        }

        const { title, description, tags } = req.body;

        const document = new Document({
            title,
            description,
            file_url: req.file.path,
            file_type: req.file.mimetype,
            file_size: req.file.size,
            user: req.user.id,  // từ middleware auth
            tags: tags ? tags.split(',') : [],
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

// API list tài liệu (public, hoặc chỉ approved sau này)
router.get('/', async (req, res) => {
    try {
        const documents = await Document.find({ status: 'approved' })
            .populate('user', 'name email');
        res.json(documents);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi khi lấy danh sách' });
    }
});


// POST thêm yêu thích
router.post('/:documentId/favorite', auth, async (req, res) => {
    try {
        const existing = await Favorite.findOne({
            user: req.user.id,
            document: req.params.documentId,
        });

        if (existing) {
            await Favorite.deleteOne({ _id: existing._id });
            return res.json({ message: 'Đã bỏ yêu thích', isFavorite: false });
        }

        const favorite = new Favorite({
            user: req.user.id,
            document: req.params.documentId,
        });

        await favorite.save();

        res.json({ message: 'Đã thêm vào yêu thích', isFavorite: true });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi khi cập nhật yêu thích' });
    }
});

// GET check user có yêu thích document không
router.get('/:documentId/favorite/status', auth, async (req, res) => {
    try {
        const favorite = await Favorite.findOne({
            user: req.user.id,
            document: req.params.documentId,
        });

        res.json({ isFavorite: !!favorite });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi kiểm tra trạng thái yêu thích' });
    }
});

// GET list tài liệu yêu thích của user
router.get('/favorites', auth, async (req, res) => {
    try {
        const favorites = await Favorite.find({ user: req.user.id })
            .populate({
                path: 'document',
                select: 'title description file_url download_count createdAt user',
                populate: {
                    path: 'user',
                    select: 'name'
                }
            })
            .sort({ created_at: -1 });

        res.json(favorites.map(f => f.document));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi khi lấy danh sách yêu thích' });
    }
});

module.exports = router;