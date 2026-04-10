const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, student_code, faculty } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email đã tồn tại' });
        }

        const user = new User({
            name,
            email,
            password_hash: password,
            student_code,
            faculty,
        });

        await user.save();

        res.status(201).json({ message: 'Đăng ký thành công' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu' });
        }

        const user = await User.findOne({ email }).select('+password_hash');

        if (!user) {
            return res.status(401).json({ error: 'Email hoặc mật khẩu sai' });
        }

        if (user.blocked) {
            return res.status(403).json({
                error: 'Tài khoản đã bị khóa'
            });
        }

        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Email hoặc mật khẩu sai' });
        }

        const token = jwt.sign(
            {
                id: user._id,
                name: user.name,
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
            },
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;