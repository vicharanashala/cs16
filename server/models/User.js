const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  // Email verification
  isVerified: {
    type: Boolean,
    default: false
  },
  // Alias for isVerified used by RAG bot and some routes
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String,
    default: null
  },
  // Gamification
  reputation: {
    type: Number,
    default: 0,
    min: 0
  },
  questionsAsked: {
    type: Number,
    default: 0
  },
  answersGiven: {
    type: Number,
    default: 0
  },
  acceptedAnswersCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'banned'],
    default: 'active'
  },
  isVolunteer: {
    type: Boolean,
    default: false
  },
  // Notification preferences
  emailNotifications: {
    type: Boolean,
    default: true
  },
  bookmarks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FAQ'
  }],
  tokenVersion: {
    type: Number,
    default: 0
  },
  // Cooldown tracking: timestamps of recent query submissions (last 3)
  recentQueryTimestamps: [
    { type: Date }
  ]
}, {
  timestamps: true,
  toObject: {
    transform: function (doc, ret) {
      delete ret.password;
      return ret;
    }
  }
});

// Clamp reputation to 0 before validation checks run
userSchema.pre('validate', function(next) {
  if (this.reputation < 0) this.reputation = 0;
  next();
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);