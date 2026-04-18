const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// ======================
// REGISTER
// ======================
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


// ======================
// LOGIN
// ======================
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
            return res.status(403).json({ error: 'Tài khoản đã bị khóa' });
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


// ======================
// OTP STORE (TEMP)
// ======================
const otpStore = {};
const resendLimit = {};


// ======================
// FORGOT PASSWORD (SEND OTP)
// ======================
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Thiếu email' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: 'Email không tồn tại' });
        }

        // chống spam (60s)
        if (resendLimit[email] && Date.now() - resendLimit[email] < 60000) {
            return res.status(429).json({ error: 'Vui lòng chờ 60s để gửi lại OTP' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000);

        otpStore[email] = {
            otp,
            expires: Date.now() + 5 * 60 * 1000
        };

        resendLimit[email] = Date.now();

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL,
                pass: process.env.EMAIL_PASS
            }
        });

        await transporter.sendMail({
            to: email,
            subject: 'Mã OTP đặt lại mật khẩu',
            html: `
                <div>
                    <h2>Mã OTP của bạn</h2>
                    <h1 style="color:#4F46E5">${otp}</h1>
                    <p>Hiệu lực: 5 phút</p>
                </div>
            `
        });

        res.json({ message: 'OTP đã gửi' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ======================
// VERIFY OTP
// ======================
router.post('/verify-otp', (req, res) => {
    const { email, otp } = req.body;

    const record = otpStore[email];

    if (!record) {
        return res.status(400).json({ error: 'Chưa gửi OTP' });
    }

    if (Date.now() > record.expires) {
        return res.status(400).json({ error: 'OTP đã hết hạn' });
    }

    if (parseInt(otp) !== record.otp) {
        return res.status(400).json({ error: 'OTP không đúng' });
    }

    res.json({ message: 'OTP hợp lệ' });
});


// ======================
// RESET PASSWORD (SECURE)
// ======================
router.post('/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ error: 'Thiếu dữ liệu' });
        }

        const record = otpStore[email];

        if (!record) {
            return res.status(400).json({ error: 'Chưa gửi OTP' });
        }

        if (Date.now() > record.expires) {
            return res.status(400).json({ error: 'OTP hết hạn' });
        }

        if (parseInt(otp) !== record.otp) {
            return res.status(400).json({ error: 'OTP sai' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: 'User không tồn tại' });
        }

        user.password_hash = await bcrypt.hash(newPassword, 10);
        await user.save();

        delete otpStore[email];

        res.json({ message: 'Đổi mật khẩu thành công' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;