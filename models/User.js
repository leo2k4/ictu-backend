const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
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
        trim: true
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

}, { timestamps: { createdAt: 'created_at', updatedAt: false } });


// ================= HASH PASSWORD =================
userSchema.pre('save', async function (next) {
    if (!this.isModified('password_hash')) return next();

    const salt = await bcrypt.genSalt(12);
    this.password_hash = await bcrypt.hash(this.password_hash, salt);
    next();
});


// ================= COMPARE PASSWORD =================
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password_hash);
};


// ================= INDEX (QUAN TRỌNG) =================
userSchema.index({ email: 1 });
userSchema.index({ student_code: 1 });

module.exports = mongoose.model('User', userSchema);