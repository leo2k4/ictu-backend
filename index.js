require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Kết nối MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB error:', err));

// ====================== ROUTES ======================
// Phải mount routes TRƯỚC khi listen
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const documentRoutes = require('./routes/documents');
app.use('/api/documents', documentRoutes);

const commentRoutes = require('./routes/comments');
app.use('/api/documents', commentRoutes);   // comment cũng mount vào /api/documents

// Test route
app.get('/', (req, res) => res.send('VERSION NEW 123'));

// Khởi động server - PHẢI để CUỐI CÙNG
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server on port ${PORT}`);
});