const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    content: { type: String, required: true, trim: true },

    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    document_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document',
        required: true
    },

    parent_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
        default: null
    },

    likes_count: {
        type: Number,
        default: 0
    }

}, { timestamps: { createdAt: 'created_at', updatedAt: false } });


// ================= INDEX =================
commentSchema.index({ document_id: 1 });
commentSchema.index({ user_id: 1 });
commentSchema.index({ parent_id: 1 });

module.exports = mongoose.model('Comment', commentSchema);