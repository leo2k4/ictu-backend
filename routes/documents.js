const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const auth = require('../middleware/auth');
const Document = require('../models/Document');
const Favorite = require('../models/Favorite');

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

        const document = new Document({
            title,
            description,
            file_url: req.file.path,
            file_type: req.file.mimetype,
            file_size: req.file.size,
            user_id: req.user.id,
            subject_id,
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

        await Favorite.create(filter);

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

module.exports = router;