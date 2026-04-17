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

        const base64Image = imageBase64.startsWith('data:')
            ? imageBase64
            : `data:image/jpeg;base64,${imageBase64}`;

        formData.append('base64Image', base64Image);
        formData.append('language', 'eng');
        formData.append('OCREngine', '2');

        const response = await axios.post(
            'https://api.ocr.space/parse/image',
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    apikey: process.env.OCR_API_KEY,
                },
                maxBodyLength: Infinity
            }
        );

        const text =
            response.data?.ParsedResults?.[0]?.ParsedText?.trim() || '';

        console.log("OCR RAW:", response.data);

        return res.json({ text });

    } catch (err) {
        console.error("OCR error:", err.response?.data || err.message);
        res.status(500).json({ message: 'OCR lỗi', error: err.message });
    }
});

module.exports = router;