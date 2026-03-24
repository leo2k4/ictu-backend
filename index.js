require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB error:', err));

app.get('/', (req, res) => res.send('ICTU Backend running'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const documentRoutes = require('./routes/documents');
app.use('/api/documents', documentRoutes);

const commentRoutes = require('./routes/comments');
app.use('/api/documents', commentRoutes);

app.use('/api/subjects', require('./routes/subjectRoutes'));
