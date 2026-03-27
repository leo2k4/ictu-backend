// routes/subjectRoutes.js
const express = require('express');
const router = express.Router();
const Subject = require('../models/Subject');

router.get('/', async (req, res) => {
    const collections = await require('mongoose')
        .connection
        .db
        .listCollections()
        .toArray();

    console.log("COLLECTIONS:", collections.map(c => c.name));

    const data = await require('mongoose')
        .connection
        .db
        .collection('subjects')
        .find()
        .toArray();

    console.log("RAW DATA:", data);

    res.json(data);
});

module.exports = router;