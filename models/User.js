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
        required: false,
        select: false
    },

    auth_provider: {
        type: String,
        enum: ['local', 'google'],
        default: 'local'
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

    blocked: { type: Boolean, default: false },

    last_login: Date

}, {
    timestamps: { createdAt: 'created_at', updatedAt: false }
});

//HASH PASSWORD 
userSchema.pre('save', async function () {
    if (this.auth_provider !== 'local') return;

    if (!this.isModified('password_hash')) return;

    try {
        const salt = await bcrypt.genSalt(12);
        this.password_hash = await bcrypt.hash(this.password_hash, salt);
    } catch (err) {
        throw err;
    }
});

//COMPARE PASSWORD 
userSchema.methods.comparePassword = async function (candidatePassword) {
    if (!this.password_hash) {
        return false;
    }
    return bcrypt.compare(candidatePassword, this.password_hash);
};

module.exports = mongoose.model('User', userSchema);