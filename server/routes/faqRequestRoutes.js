const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const {
  createFAQRequest,
  getFAQRequests,
  approveFAQRequest,
  rejectFAQRequest
} = require('../controllers/faqRequestController');

// Submit a FAQ request (any logged-in user)
router.post('/', protect, createFAQRequest);

// Get all FAQ requests (admin only)
router.get('/', protect, adminOnly, getFAQRequests);

// Approve a FAQ request (admin only) — creates the FAQ
router.post('/:id/approve', protect, adminOnly, approveFAQRequest);

// Reject a FAQ request (admin only)
router.post('/:id/reject', protect, adminOnly, rejectFAQRequest);
router.delete('/:id/reject', protect, adminOnly, rejectFAQRequest);

module.exports = router;