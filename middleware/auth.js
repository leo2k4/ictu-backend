const jwt = require('jsonwebtoken');
const User = require('../models/User');


const verifyToken = async (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'Không có token' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({ error: 'User không tồn tại' });
        }

        if (user.blocked) {
            return res.status(403).json({
                error: 'Tài khoản đã bị khóa'
            });
        }

        req.user = user;
        next();

    } catch (err) {
        return res.status(401).json({ error: 'Token không hợp lệ' });
    }
};

const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Chưa xác thực' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Không có quyền' });
        }

        next();
    };
};

const isAdmin = authorizeRoles('admin');

module.exports = verifyToken;
module.exports.verifyToken = verifyToken;
module.exports.authorizeRoles = authorizeRoles;
module.exports.isAdmin = isAdmin;