const express = require('express');
const router = express.Router();
const { register, login, getMe, verifyEmail, forgotPassword, resetPassword, resendVerification, logoutAll } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/verify-email/:token', verifyEmail);

// Protected routes
router.get('/me', protect, getMe);
router.post('/resend-verification', protect, resendVerification);
router.post('/logout-all', protect, logoutAll);

module.exports = router;