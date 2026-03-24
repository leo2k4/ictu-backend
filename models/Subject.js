const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: String,
    credits: Number
}, { timestamps: true });

module.exports = mongoose.model('Subject', subjectSchema);