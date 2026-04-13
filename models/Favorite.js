const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    document_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document',
        required: true
    }

}, { timestamps: { createdAt: 'created_at', updatedAt: false } });


favoriteSchema.index({ user_id: 1, document_id: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', favoriteSchema);