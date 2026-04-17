const express = require('express');
const axios = require('axios');
const FormData = require('form-data');

const router = express.Router();

router.post('/ocr', async (req, res) => {
    try {
        const { imageBase64 } = req.body;

        if (!imageBase64) {
            return res.status(400).json({ message: 'Thiếu ảnh' });
        }

        const formData = new FormData();
        formData.append('base64Image', imageBase64);
        formData.append('apikey', process.env.OCR_API_KEY);
        formData.append('language', 'eng');

        const response = await axios.post(
            'https://api.ocr.space/parse/image',
            formData,
            { headers: formData.getHeaders() }
        );

        const text = response.data?.ParsedResults?.[0]?.ParsedText || '';

        res.json({ text });

    } catch (err) {
        console.error("OCR error:", err.response?.data || err.message);
        res.status(500).json({ message: 'OCR lỗi' });
    }
});

module.exports = router;