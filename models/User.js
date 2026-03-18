const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password_hash: { type: String, required: true, select: false },
    student_code: { type: String, unique: true, sparse: true },
    faculty: String,
    role: { type: String, enum: ['student', 'teacher', 'admin'], default: 'student' },
    created_at: { type: Date, default: Date.now },
});

// Hash password trước khi save
userSchema.pre('save', async function () {

    if (!this.isModified('password_hash')) {
        return;
    }

    const salt = await bcrypt.genSalt(12);
    this.password_hash = await bcrypt.hash(this.password_hash, salt);

});

// Method so sánh password khi login
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password_hash);
};

module.exports = mongoose.model('User', userSchema);