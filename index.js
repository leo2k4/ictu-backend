require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Debug Environment Variables
// console.log('=== ENVIRONMENT DEBUG ===');
// console.log('NODE_ENV:', process.env.NODE_ENV);
// console.log('MONGO_URI exists:', !!process.env.MONGO_URI);
// console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);
// console.log('JWT_SECRET length:', process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0);
// console.log('CLOUDINARY_CLOUD_NAME exists:', !!process.env.CLOUDINARY_CLOUD_NAME);
// console.log('========================');

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Kết nối MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => {
        console.error('MongoDB connection error:', err.message);
    });

//ROUTES
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const userRoutes = require('./routes/users');
app.use('/api/users', userRoutes);

// Documents routes
const documentRoutes = require('./routes/documents');
app.use('/api/documents', documentRoutes);

// Subjects routes
const subjectRoutes = require('./routes/subjectRoutes');
app.use('/api/subjects', subjectRoutes);

// Comments routes 
const commentRoutes = require('./routes/comments');
app.use('/api/comments', commentRoutes);

const notificationsRouter = require('./routes/notifications');

app.use('/api/notifications', notificationsRouter);

const reportRoutes = require('./routes/reports');

app.use('/api/reports', reportRoutes);

// Test route
app.get('/', (req, res) => res.send('VERSION NEW 123'));

app.use('/api/dashboard', require('./routes/dashboard'));

const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);

const aiRoutes = require('./routes/ai');
app.use('/api/ai', aiRoutes);

const ocrRoutes = require('./routes/ocr');
app.use('/api/ocr', ocrRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('🔥 Global Error:', err.message);
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: err.message || 'Lỗi server'
    });
});

app.use('/uploads', express.static('uploads'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});