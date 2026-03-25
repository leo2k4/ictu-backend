const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },

    password_hash: {
        type: String,
        required: true,
        select: false
    },

    student_code: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        index: true
    },

    faculty: { type: String, trim: true },

    role: {
        type: String,
        enum: ['student', 'teacher', 'admin'],
        default: 'student'
    },

    avatar_url: String,

    is_verified: { type: Boolean, default: false },

    last_login: Date

}, {
    timestamps: { createdAt: 'created_at', updatedAt: false }
});

// ================= HASH PASSWORD - PHIÊN BẢN AN TOÀN NHẤT =================
userSchema.pre('save', async function (next) {
    // Chỉ hash nếu password_hash bị thay đổi hoặc là user mới
    if (!this.isModified('password_hash')) {
        return next();
    }

    try {
        const salt = await bcrypt.genSalt(12);
        this.password_hash = await bcrypt.hash(this.password_hash, salt);
        next();                    // Thành công → tiếp tục save
    } catch (err) {
        next(err);                 // Có lỗi → truyền lỗi cho Mongoose
    }
});

// ================= COMPARE PASSWORD =================
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password_hash);
};

// Index (không cần khai báo riêng nữa vì đã có trong schema)
module.exports = mongoose.model('User', userSchema);