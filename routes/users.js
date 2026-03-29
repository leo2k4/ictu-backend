const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // tạm thời lưu local

router.patch('/avatar', auth, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Chưa chọn ảnh' });

        // Giả sử bạn upload lên cloud và có url
        const avatar_url = `http://localhost:5000/${req.file.path}`;

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

const Document = require('../models/Document');
const Favorite = require('../models/Favorite');

router.get('/users/stats', auth, async (req, res) => {
    try {
        const uploaded = await Document.countDocuments({ user_id: req.user.id });
        const downloads = await Document.aggregate([
            { $match: { user_id: req.user.id } },
            { $group: { _id: null, total: { $sum: "$download_count" } } }
        ]);
        const favorites = await Favorite.countDocuments({ user_id: req.user.id });

        res.json({
            uploaded,
            downloads: downloads[0]?.total || 0,
            favorites
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});