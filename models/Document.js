const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },

    description: String,

    file_url: { type: String, required: true },

    file_type: String,

    file_size: Number,

    subject_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true
    },

    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },

    tags: [{ type: String, trim: true }],

    download_count: { type: Number, default: 0 }

}, { timestamps: { createdAt: 'upload_date', updatedAt: false } });


// ================= INDEX =================
documentSchema.index({ subject_id: 1 });
documentSchema.index({ user_id: 1 });
documentSchema.index({ status: 1 });
documentSchema.index({ tags: 1 });

module.exports = mongoose.model('Document', documentSchema);