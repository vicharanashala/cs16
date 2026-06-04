const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // e.g. 'soft-deleted', 'restored', 'resolved SLA breach', 'created pin', etc.
  action: {
    type: String,
    required: true,
    trim: true
  },
  // Reference to the Admin/User who performed the action
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // e.g. 'FAQ', 'Query', 'Pin'
  targetModel: {
    type: String,
    required: true,
    trim: true
  },
  // Optional reference to the targeted document ID
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  // Optional display name of the target document (e.g. FAQ title, Pin title, Query title)
  targetName: {
    type: String,
    default: null,
    trim: true
  }
}, {
  timestamps: { createdAt: 'timestamp', updatedAt: false }
});

// Index for fast chronological lookup
auditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
