const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true
  },
  finalAnswer: {
    type: String,
    required: true
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  upvotes: {
    type: Number,
    default: 0,
    min: 0
  },
  viewCount: {
    type: Number,
    default: 0
  },
  lastViewed: {
    type: Date,
    default: null
  },
  upvoters: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: {
    type: String,
    enum: ['resolved', 'pending', 'duplicate'],
    default: 'resolved'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Source query that this FAQ resolved (if converted from query)
  sourceQuery: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Query'
  },
  // Related FAQs (for suggestions)
  relatedFAQs: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FAQ'
  }],
  // Admin-only fields
  pinned: {
    type: Boolean,
    default: false
  },
  // Soft delete
  deletedAt: {
    type: Date,
    default: null
  },
  // Merge tracking
  mergedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FAQ',
    default: null
  },
  mergedInto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FAQ',
    default: null
  },
  // Canonical FAQ this is a duplicate of (set when status becomes 'duplicate')
  duplicateOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FAQ',
    default: null
  },
  // Persisted flag indicating if the FAQ passed LLM placeholder/quality validation
  isValidated: {
    type: Boolean,
    default: false
  },
  embedding: {
    type: [Number],
    default: undefined
  }
}, {
  timestamps: true
});

// Enforce invariant: upvotes is always >= 0
faqSchema.pre('validate', function(next) {
  if (this.upvotes < 0) this.upvotes = 0;
  next();
});

// Text index for full-text search on title, description, finalAnswer, tags
faqSchema.index({ title: 'text', description: 'text', finalAnswer: 'text', tags: 'text' });

module.exports = mongoose.model('FAQ', faqSchema);
