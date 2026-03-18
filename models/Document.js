const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: String,
    file_url: { type: String, required: true },
    file_type: String,
    file_size: Number,
    subject: String,  // tạm dùng string, sau có thể ref nếu cần Subject model
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    tags: [String],
    download_count: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Document', documentSchema);