const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    created_at: { type: Date, default: Date.now },
});

favoriteSchema.index({ user: 1, document: 1 }, { unique: true }); // Tránh duplicate

module.exports = mongoose.model('Favorite', favoriteSchema);