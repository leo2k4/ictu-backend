// routes/subjectRoutes.js
const express = require('express');
const router = express.Router();
const Subject = require('../models/Subject');

router.get('/', async (req, res) => {
    try {
        const subjects = await Subject.find().select('name code');
        res.json(subjects);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi lấy môn học' });
    }
});

module.exports = router;