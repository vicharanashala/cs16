const FAQRequest = require('../models/FAQRequest');
const Query = require('../models/Query');
const Answer = require('../models/Answer');
const FAQ = require('../models/FAQ');
const User = require('../models/User');
const Notification = require('../models/Notification');

// Submit a new FAQ request (from an answer on a community query)
exports.createFAQRequest = async (req, res) => {
  try {
    const { queryId, answerId, proposedQuestion, proposedAnswer, proposedTags } = req.body;

    if (!queryId || !answerId || !proposedQuestion || !proposedAnswer) {
      return res.status(400).json({ error: 'queryId, answerId, proposedQuestion, and proposedAnswer are required' });
    }

    // Verify query and answer exist
    const query = await Query.findById(queryId);
    if (!query) return res.status(404).json({ error: 'Query not found' });

    const answer = await Answer.findById(answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    // Prevent duplicate requests for the same answer
    const existing = await FAQRequest.findOne({ answerId, status: 'pending' });
    if (existing) {
      return res.status(409).json({ error: 'A FAQ request has already been submitted for this answer' });
    }

    const faqRequest = await FAQRequest.create({
      queryId,
      answerId,
      submittedBy: req.user._id,
      proposedQuestion,
      proposedAnswer,
      proposedTags: proposedTags || query.tags || []
    });

    await faqRequest.populate('submittedBy', 'name reputation');

    res.status(201).json(faqRequest);
  } catch (error) {
    console.error('Create FAQ request error:', error);
    res.status(500).json({ error: 'Failed to submit FAQ request' });
  }
};

// Get all FAQ requests (admin)
exports.getFAQRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [requests, total] = await Promise.all([
      FAQRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('submittedBy', 'name reputation')
        .populate('reviewedBy', 'name')
        .populate({
          path: 'queryId',
          select: 'title tags'
        })
        .populate({
          path: 'answerId',
          select: 'content userId',
          populate: { path: 'userId', select: 'name' }
        }),
      FAQRequest.countDocuments(filter)
    ]);

    res.json({
      requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get FAQ requests error:', error);
    res.status(500).json({ error: 'Failed to fetch FAQ requests' });
  }
};

// Approve a FAQ request — creates the FAQ entry
exports.approveFAQRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    const faqRequest = await FAQRequest.findById(id);
    if (!faqRequest) return res.status(404).json({ error: 'FAQ request not found' });

    if (faqRequest.status !== 'pending') {
      return res.status(400).json({ error: `Cannot approve — request is already ${faqRequest.status}` });
    }

    // Determine the section/category tag (first tag from query, or default)
    const rawTag = (faqRequest.proposedTags && faqRequest.proposedTags[0])
      ? faqRequest.proposedTags[0]
      : 'general';
    const sectionTag = rawTag
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 30);

    // Build the FAQ section tag: "from-community-{tag}"
    const communitySectionTag = `from-community-${sectionTag}`;

    // Create the FAQ
    const faq = await FAQ.create({
      title: faqRequest.proposedQuestion,
      description: faqRequest.proposedQuestion,
      finalAnswer: faqRequest.proposedAnswer,
      tags: [communitySectionTag, faqRequest._id.toString()],
      status: 'resolved',
      createdBy: faqRequest.submittedBy
    });

    // Update the request
    faqRequest.status = 'approved';
    faqRequest.adminNotes = adminNotes || '';
    faqRequest.reviewedBy = req.user._id;
    faqRequest.reviewedAt = new Date();
    await faqRequest.save();

    // Update submitter's reputation
    await User.findByIdAndUpdate(faqRequest.submittedBy, {
      $inc: { reputation: 10 }
    });

    // Award +15 reputation to BOTH original author and responder for collaborative promotion
    const query = await Query.findById(faqRequest.queryId);
    const answer = await Answer.findById(faqRequest.answerId);
    if (query) {
      query.status = 'closed';
      query.resolvedFAQ = faq._id;
      await query.save();

      await User.findByIdAndUpdate(query.createdBy, { $inc: { reputation: 15 } });
    }
    if (answer) {
      await User.findByIdAndUpdate(answer.userId, { $inc: { reputation: 15 } });
    }

    // Clear RAG cache so the newly approved FAQ is instantly indexed
    try {
      const { clearRagCache } = require('./ragController');
      clearRagCache();
    } catch (err) {
      console.warn('Failed to clear RAG cache on FAQ approval:', err.message);
    }

    const populated = await FAQRequest.findById(id)
      .populate('submittedBy', 'name reputation')
      .populate('reviewedBy', 'name')
      .populate('queryId', 'title');

    res.json({ message: 'FAQ approved and created', faq, request: populated });
  } catch (error) {
    console.error('Approve FAQ request error:', error);
    res.status(500).json({ error: 'Failed to approve FAQ request' });
  }
};

// Reject a FAQ request
exports.rejectFAQRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const rejectionReason = req.body.rejectionReason || req.body.adminNotes || '';

    const faqRequest = await FAQRequest.findById(id);
    if (!faqRequest) return res.status(404).json({ error: 'FAQ request not found' });

    if (faqRequest.status !== 'pending') {
      return res.status(400).json({ error: `Cannot reject — request is already ${faqRequest.status}` });
    }

    faqRequest.status = 'rejected';
    faqRequest.adminNotes = rejectionReason;
    faqRequest.reviewedBy = req.user._id;
    faqRequest.reviewedAt = new Date();
    await faqRequest.save();

    await Notification.create({
      recipient: faqRequest.submittedBy,
      sender: req.user._id,
      type: 'faq_request',
      title: 'FAQ request rejected',
      message: `Your FAQ request "${faqRequest.proposedQuestion}" was rejected${rejectionReason ? `: ${rejectionReason}` : '.'}`,
      link: ''
    });

    const populated = await FAQRequest.findById(id)
      .populate('submittedBy', 'name reputation')
      .populate('reviewedBy', 'name')
      .populate('queryId', 'title');

    res.json({ message: 'FAQ request rejected', request: populated });
  } catch (error) {
    console.error('Reject FAQ request error:', error);
    res.status(500).json({ error: 'Failed to reject FAQ request' });
  }
};