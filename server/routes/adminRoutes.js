const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const {
  pinFAQ,
  mergeFAQs,
  editFAQFinalAnswer,
  deleteFAQ,
  deleteAnswer,
  deleteQuery,
  getAnalytics,
  getSlaStats,
  rejectAnswer,
  getModerationQueue,
  getPins,
  createPin,
  updatePin,
  deletePin,
  getAdminFaqs,
  patchFaq,
  getAuditLogs,
  bulkUserAction
} = require('../controllers/adminController');

// ─── FAQ Management ────────────────────────────────────────────────────────────

// Pin/Unpin a FAQ
router.patch('/faqs/:id/pin', protect, adminOnly, pinFAQ);

// Merge two FAQs (sourceId → targetId)
router.post('/faqs/merge', protect, adminOnly, mergeFAQs);

// Edit FAQ finalAnswer (with audit trail)
router.patch('/faqs/:id/final-answer', protect, adminOnly, editFAQFinalAnswer);

// Soft-delete / Restore — handled by patchFaq below
// (PATCH /faqs/:id is now exclusively managed by patchFaq)

// ─── Answer Management ────────────────────────────────────────────────────────

// Soft-delete / Restore any answer
router.patch('/answers/:id', protect, adminOnly, deleteAnswer);

// Reject (hard delete equivalent via soft-delete) an answer
router.patch('/answers/:id/reject', protect, adminOnly, rejectAnswer);

// ─── Query Management ─────────────────────────────────────────────────────────

// Soft-delete / Restore any query
router.patch('/queries/:id', protect, adminOnly, deleteQuery);

// ─── User Management ─────────────────────────────────────────────────────────

// Bulk ban/unban/promote users in one request
router.patch('/users/bulk', protect, adminOnly, bulkUserAction);

// ─── Analytics & Stats ─────────────────────────────────────────────────────────

// Full analytics dashboard
router.get('/analytics', protect, adminOnly, getAnalytics);

// SLA-specific stats
router.get('/sla-stats', protect, adminOnly, getSlaStats);

// FAQ Management
router.get('/faqs', protect, adminOnly, getAdminFaqs);
router.patch('/faqs/:id', protect, adminOnly, patchFaq);

// Pin Management
router.get('/pins', protect, adminOnly, getPins);
router.post('/pins', protect, adminOnly, createPin);
router.patch('/pins/:id', protect, adminOnly, updatePin);
router.delete('/pins/:id', protect, adminOnly, deletePin);

// Moderation queue (pending FAQ requests + SLA-breached queries)
router.get('/moderation', protect, adminOnly, getModerationQueue);

// Audit Logs
router.get('/audit-logs', protect, adminOnly, getAuditLogs);

module.exports = router;
