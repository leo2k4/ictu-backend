const express = require('express');
const router = express.Router();
const multer = require('multer');

const auth = require('../middleware/auth');
const User = require('../models/User');
const Document = require('../models/Document');
const Favorite = require('../models/Favorite');

// ================== MULTER ==================
const upload = multer({ dest: 'uploads/' });


// ================== UPDATE AVATAR ==================
// PATCH /api/users/avatar
router.patch('/avatar', auth, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Chưa chọn ảnh' });
        }

        // ⚠️ URL phải là domain server thật (Render)
        const avatar_url = `https://ictu-backend.onrender.com/${req.file.path}`;

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { avatar_url },
            { new: true }
        ).select('-password_hash');

        res.json({ avatar_url: user.avatar_url });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ================== USER STATS ==================
// GET /api/users/stats
router.get('/stats', auth, async (req, res) => {
    try {
        const uploaded = await Document.countDocuments({
            user_id: req.user.id
        });

        const downloadsAgg = await Document.aggregate([
            { $match: { user_id: req.user.id } },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$download_count" }
                }
            }
        ]);

        const favorites = await Favorite.countDocuments({
            user_id: req.user.id
        });

        res.json({
            uploaded,
            downloads: downloadsAgg[0]?.total || 0,
            favorites
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ================== USER DOCUMENTS ==================
// GET /api/users/documents
router.get('/documents', auth, async (req, res) => {
    try {
        const docs = await Document.find({
            user_id: req.user.id
        }).sort({ upload_date: -1 });

        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ================== USER FAVORITES ==================
// GET /api/users/favorites
router.get('/favorites', auth, async (req, res) => {
    try {
        const favorites = await Favorite.find({
            user_id: req.user.id
        }).populate('document_id');

        res.json(favorites);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;