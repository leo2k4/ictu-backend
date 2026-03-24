const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();


// ================= REGISTER =================
router.post('/register', async (req, res) => {
    try {
        let { name, email, password, student_code, faculty } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
        }

        email = email.toLowerCase().trim();

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email đã tồn tại' });
        }

        const user = new User({
            name: name.trim(),
            email,
            password_hash: password,
            student_code,
            faculty,
        });

        await user.save();

        res.status(201).json({ message: 'Đăng ký thành công' });

    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Dữ liệu bị trùng (email hoặc student_code)' });
        }
        res.status(500).json({ error: 'Lỗi server' });
    }
});


// ================= LOGIN =================
router.post('/login', async (req, res) => {
    try {
        let { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu' });
        }

        email = email.toLowerCase().trim();

        const user = await User.findOne({ email }).select('+password_hash');

        if (!user) {
            return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });
        }

        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });
        }

        // cập nhật last_login
        user.last_login = new Date();
        await user.save();

        const token = jwt.sign(
            {
                id: user._id,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar_url: user.avatar_url
            },
        });

    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;