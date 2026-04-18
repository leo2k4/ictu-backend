const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const User = require('../models/User');
const auth = require('../middleware/auth');
const redis = require('../config/redis');

const router = express.Router();


// ======================
// REGISTER
// ======================
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, student_code, faculty } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Thiếu thông tin' });
        }

        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(400).json({ error: 'Email đã tồn tại' });
        }

        const user = new User({
            name,
            email,
            password_hash: password,
            student_code,
            faculty
        });

        await user.save();

        res.status(201).json({ message: 'OK' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// LOGIN
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email }).select('+password_hash');
        if (!user) return res.status(401).json({ error: 'Sai thông tin' });

        const match = await user.comparePassword(password);
        if (!match) return res.status(401).json({ error: 'Sai thông tin' });

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ token, user });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// EMAIL TRANSPORT
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASS
    }
});


// FORGOT PASSWORD (SEND OTP)
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'Email không tồn tại' });

        const lastSend = await redis.get(`limit:${email}`);
        if (lastSend) {
            return res.status(429).json({ error: 'Chờ 60s' });
        }
        await redis.set(`limit:${email}`, Date.now(), { EX: 60 });

        const otp = Math.floor(100000 + Math.random() * 900000);

        await redis.set(
            `otp:${email}`,
            JSON.stringify({
                otp,
                expires: Date.now() + 5 * 60 * 1000
            }),
            { EX: 300 }
        );

        await transporter.sendMail({
            to: email,
            subject: 'OTP Reset Password',
            html: `
                <div>
                    <h2>Mã OTP của bạn</h2>
                    <h1 style="color:#4F46E5">${otp}</h1>
                    <p>Hiệu lực 5 phút</p>
                </div>
            `
        });

        res.json({ message: 'OTP đã gửi' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// VERIFY OTP
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        const data = await redis.get(`otp:${email}`);
        if (!data) return res.status(400).json({ error: 'Chưa gửi OTP' });

        const record = JSON.parse(data);

        if (Date.now() > record.expires) {
            return res.status(400).json({ error: 'OTP hết hạn' });
        }

        if (parseInt(otp) !== record.otp) {
            return res.status(400).json({ error: 'OTP sai' });
        }

        res.json({ message: 'OK' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// RESET PASSWORD
router.post('/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        const data = await redis.get(`otp:${email}`);
        if (!data) return res.status(400).json({ error: 'OTP không tồn tại' });

        const record = JSON.parse(data);

        if (parseInt(otp) !== record.otp) {
            return res.status(400).json({ error: 'OTP sai' });
        }

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User không tồn tại' });

        user.password_hash = newPassword;
        await user.save();

        await redis.del(`otp:${email}`);
        await redis.del(`limit:${email}`);

        res.json({ message: 'Đổi mật khẩu thành công' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;