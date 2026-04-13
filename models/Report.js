const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
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
    reason: {
        type: String,
        enum: ['SPAM', 'COPYRIGHT', 'WRONG_CONTENT', 'INAPPROPRIATE', 'OTHER'],
        required: true
    },
    description: {
        type: String
    },
    status: {
        type: String,
        enum: ['PENDING', 'RESOLVED', 'REJECTED'],
        default: 'PENDING'
    }
}, {
    timestamps: { createdAt: 'created_at' }
});

reportSchema.index({ user_id: 1, document_id: 1 }, { unique: true });

module.exports = mongoose.model('Report', reportSchema);