const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - require valid JWT
const protect = async (req, res, next) => {
  try {
    let token;


    // Support both header conventions:
    //   Authorization: Bearer <token>   (standard)
    //   x-auth-token: <token>           (legacy client)
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.headers['x-auth-token']) {
      token = req.headers['x-auth-token'];
    }

    if (!token) {
      return res.status(401).json({ error: 'Not authorized - no token provided' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'grantha-secret-key');

    // Get user from token
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check tokenVersion
    if (decoded.tokenVersion === undefined || decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ error: 'Session expired - please log in again' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Account is banned' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Not authorized - invalid token' });
  }
};

// Optional auth - attach user if token exists, but don't require it
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.headers['x-auth-token']) {
      token = req.headers['x-auth-token'];
    }

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'grantha-secret-key');
      const user = await User.findById(decoded.userId);
      if (user && user.status === 'active' && decoded.tokenVersion !== undefined && decoded.tokenVersion === user.tokenVersion) {
        req.user = user;
      }
    }
    next();
  } catch (error) {
    // Continue without user
    next();
  }
};

// Admin only middleware
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
};

module.exports = { protect, optionalAuth, adminOnly };