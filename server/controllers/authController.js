const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const { sendEmail } = require('../services/emailService');

const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// Generate JWT token
const generateToken = (userId, tokenVersion = 0) => {
  return jwt.sign({ userId, tokenVersion }, process.env.JWT_SECRET || 'grantha-secret-key', {
    expiresIn: '7d'
  });
};

// Generate a random hex token
const generateRandomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

// Register new user
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate inputs
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create new user (email verification bypassed for now)
    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      isVerified: true
    });

    await user.save();

    const token = generateToken(user._id, user.tokenVersion || 0);

    const rank = await User.countDocuments({
      status: 'active',
      role: { $ne: 'admin' },
      reputation: { $gt: user.reputation || 0 }
    }) + 1;

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        reputation: user.reputation,
        isVerified: user.isVerified,
        isVolunteer: user.isVolunteer,
        rank
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if banned
    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Account is banned' });
    }

    const token = generateToken(user._id, user.tokenVersion || 0);

    const rank = await User.countDocuments({
      status: 'active',
      role: { $ne: 'admin' },
      reputation: { $gt: user.reputation || 0 }
    }) + 1;

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        reputation: user.reputation,
        questionsAsked: user.questionsAsked,
        answersGiven: user.answersGiven,
        isVerified: user.isVerified,
        isVolunteer: user.isVolunteer,
        rank
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

// Get current user profile
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const rank = await User.countDocuments({
      status: 'active',
      role: { $ne: 'admin' },
      reputation: { $gt: user.reputation || 0 }
    }) + 1;

    res.json({ ...user.toObject(), rank });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

// Verify email address
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    user.isVerified = true;
    user.verificationToken = null;
    await user.save();

    res.json({ message: 'Email verified successfully! You can now log in.' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
};

// Forgot password — send reset email
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return 200 even if user not found (don't leak existence)
    if (!user) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    // Invalidate any existing reset tokens for this email
    await PasswordReset.updateMany({ email: email.toLowerCase(), used: false }, { used: true });

    const resetToken = generateRandomToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await PasswordReset.create({
      email: email.toLowerCase(),
      token: resetToken,
      expiresAt
    });

    const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;

    sendEmail({
      to: user.email,
      subject: 'Reset your Grantha password',
      text: `Hi ${user.name},\n\nYou requested a password reset. Click below to set a new password:\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
      html: `<h2>Hi ${user.name},</h2><p>You requested a password reset. Click below to set a new password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.<br>If you didn't request this, you can safely ignore this email.</p>`
    }).catch(err => console.error('Password reset email failed:', err.message));

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
};

// Reset password using token
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const reset = await PasswordReset.findOne({
      token,
      used: false,
      expiresAt: { $gt: new Date() }
    });

    if (!reset) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const user = await User.findOne({ email: reset.email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.password = password;
    await user.save();

    // Mark token as used
    reset.used = true;
    await reset.save();

    res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

// Resend verification email
exports.resendVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.isVerified) {
      return res.json({ message: 'Email already verified' });
    }

    const verificationToken = generateRandomToken();
    user.verificationToken = verificationToken;
    await user.save();

    const verifyUrl = `${APP_URL}/verify-email?token=${verificationToken}`;
    sendEmail({
      to: user.email,
      subject: 'Verify your Grantha account',
      text: `Please verify your email by clicking this link:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
      html: `<p>Please verify your email by clicking the link below:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`
    }).catch(err => console.error('Verification email failed:', err.message));

    res.json({ message: 'Verification email sent. Check your inbox.' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
};

// Sign out of all active devices
exports.logoutAll = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    res.json({ message: 'Successfully signed out of all active devices.' });
  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({ error: 'Failed to sign out of all devices' });
  }
};