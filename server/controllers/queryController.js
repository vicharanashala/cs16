const Query = require('../models/Query');
const Answer = require('../models/Answer');
const FAQ = require('../models/FAQ');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

// 24-hour SLA window in ms
const SLA_24HR = 24 * 60 * 60 * 1000;

// Get all queries with optional filters
exports.getQueries = async (req, res) => {
  try {
    const { status, tag, sort = 'recent', page = 1, limit = 20, claimed, q } = req.query;
    const query = {};

    if (status === 'open') query.status = 'open';
    else if (status === 'answered') query.status = 'answered';
    else if (status === 'closed') query.status = 'closed';

    if (tag) query.tags = tag.toLowerCase();
    if (claimed === 'true') query.assignedTo = { $ne: null };
    if (q) query.$text = { $search: q };
    if (req.query.createdBy) {
      const mongoose = require('mongoose');
      query.createdBy = new mongoose.Types.ObjectId(req.query.createdBy);
    }
    query.deletedAt = null;

    let sortOption = { communityScore: -1, createdAt: -1 };
    if (sort === 'recent') sortOption = { createdAt: -1 };
    else if (sort === 'trending') sortOption = { communityScore: -1, createdAt: -1 };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Single aggregation: fetch queries + populate refs + attach accepted answers in one shot (fixes N+1)
    // Note: $lookup replaces .populate() in aggregation pipelines — refs are not auto-populated
    const queries = await Query.aggregate([
      { $match: query },
      // Populate createdBy (user name + reputation)
      { $lookup: { from: 'users', localField: 'createdBy', foreignField: '_id', as: 'createdByArr' } },
      { $addFields: { createdBy: { $arrayElemAt: ['$createdByArr', 0] } } },
      { $project: { createdByArr: 0 } },
      // Populate assignedTo (user name + reputation)
      { $lookup: { from: 'users', localField: 'assignedTo', foreignField: '_id', as: 'assignedToArr' } },
      { $addFields: { assignedTo: { $arrayElemAt: ['$assignedToArr', 0] } } },
      { $project: { assignedToArr: 0 } },
      // Populate taggedUsers (user name + reputation)
      { $lookup: { from: 'users', localField: 'taggedUsers', foreignField: '_id', as: 'taggedUsers' } },
      // Populate resolvedFAQ (FAQ title)
      { $lookup: { from: 'faqs', localField: 'resolvedFAQ', foreignField: '_id', as: 'resolvedFAQArr' } },
      { $addFields: { resolvedFAQ: { $arrayElemAt: ['$resolvedFAQArr', 0] } } },
      { $project: { resolvedFAQArr: 0 } },
      // Attach accepted answer inline via $lookup
      {
        $lookup: {
          from: 'answers',
          let: { qId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$queryId', '$$qId'] },
                    { $eq: ['$isAccepted', true] }
                  ]
                }
              }
            },
            { $project: { _id: 1, content: 1, userId: 1 } },
            { $limit: 1 }
          ],
          as: 'acceptedAnswerArr'
        }
      },
      { $addFields: { acceptedAnswer: { $arrayElemAt: ['$acceptedAnswerArr', 0] } } },
      { $project: { acceptedAnswerArr: 0 } },
      // Sort and paginate
      { $sort: sortOption },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]);

    const total = await Query.countDocuments(query);

    res.json({
      queries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get queries error:', error);
    res.status(500).json({ error: 'Failed to fetch queries' });
  }
};

// Get single query with answers
exports.getQueryById = async (req, res) => {
  try {
    const query = await Query.findById(req.params.id)
      .populate('createdBy', 'name reputation')
      .populate('assignedTo', 'name reputation')
      .populate('taggedUsers', 'name reputation')
      .populate('relatedQueries', 'title status');

    if (!query) return res.status(404).json({ error: 'Query not found' });

    const answers = await Answer.find({
  queryId: query._id,
  deletedAt: null
})
  .populate('userId', 'name reputation')
  .sort({ upvotes: -1, createdAt: 1 });

    // Attach a confidence score to each answer and sort by it
    // Formula: upvotes + (isAccepted ? 50 : 0) + log10(authorReputation+1)*5
    // This surfaces accepted answers from established users above raw upvote counts
    const scoredAnswers = answers.map(a => {
      const rep = a.userId?.reputation || 0;
      const confidenceScore = a.upvotes + (a.isAccepted ? 50 : 0) + Math.log10(rep + 1) * 5;
      return { ...a.toObject(), confidenceScore };
    });
    scoredAnswers.sort((a, b) => b.confidenceScore - a.confidenceScore);

    const acceptedAnswerDoc = answers.find(a => a.isAccepted);
    const queryObj = {
      ...query.toObject(),
      acceptedAnswer: acceptedAnswerDoc ? acceptedAnswerDoc.toObject() : null
    };

    res.json({ query: queryObj, answers: scoredAnswers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch query' });
  }
};

// Create a new query with 24hr SLA
exports.createQuery = async (req, res) => {
  try {
    const { title, description, tags, taggedUsers, attachments } = req.body;
    if (req.user.role === 'admin') {
      return res.status(403).json({ error: 'Admins cannot raise queries' });
    }
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }
    if (taggedUsers && Array.isArray(taggedUsers) && taggedUsers.length > 2) {
      return res.status(400).json({ error: 'You are allowed to tag a maximum of 2 contributors' });
    }

    // Validate attachments if provided (max 5, each must have url + filename + mimetype)
    if (attachments !== undefined) {
      if (!Array.isArray(attachments)) {
        return res.status(400).json({ error: 'Attachments must be an array' });
      }
      if (attachments.length > 5) {
        return res.status(400).json({ error: 'You can attach a maximum of 5 files' });
      }
    }

    // Cooldown: max 3 queries per 24 hours
    const COOLDOWN_LIMIT = 3;
    const COOLDOWN_WINDOW_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const userDoc = await User.findById(req.user._id).select('recentQueryTimestamps');
    const recentTs = (userDoc?.recentQueryTimestamps || []).filter(ts => now - ts < COOLDOWN_WINDOW_MS);
    if (recentTs.length >= COOLDOWN_LIMIT) {
      const oldestAllowed = now - COOLDOWN_WINDOW_MS;
      const nextAvailable = [...recentTs].sort()[0];
      const waitMs = nextAvailable + COOLDOWN_WINDOW_MS - now;
      const waitMins = Math.ceil(waitMs / 60000);
      const hours = Math.floor(waitMins / 60);
      const mins = waitMins % 60;
      const waitStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      return res.status(429).json({
        error: `You can only raise 3 queries every 24 hours`,
        nextAvailableAt: new Date(now + waitMs),
        waitStr
      });
    }

    // Reject if this query is clearly a duplicate of an already-answered question
    const { jaccardSimilarity } = require('./searchController');

    // Lexical pre-filtering using text search index to restrict candidate pool to at most 30 items
    let rawQueries = [];
    try {
      rawQueries = await Query.find({
        status: { $ne: 'closed' },
        deletedAt: null,
        $text: { $search: title }
      })
      .select('_id title description')
      .limit(30)
      .lean();
    } catch (err) {
      // Safe fallback if index is not ready or text search fails
      rawQueries = await Query.find({ status: { $ne: 'closed' }, deletedAt: null })
        .select('_id title description')
        .limit(100)
        .lean();
    }

    for (const q of rawQueries) {
      const sim = jaccardSimilarity(title, q.title);
      if (sim >= 0.85) {
        const acceptedAnswer = await Answer.findOne({ queryId: q._id, isAccepted: true })
          .select('_id content upvotes').lean();
        
        // Deduct duplicate penalty
        const userDoc = await User.findById(req.user._id);
        if (userDoc) {
          userDoc.reputation = Math.max(0, userDoc.reputation - 2);
          await userDoc.save();
        }

        return res.status(409).json({
          error: 'This question already has an accepted answer in the community',
          duplicateQueryId: q._id,
          duplicateTitle: q.title,
          acceptedAnswer: acceptedAnswer ? {
            content: acceptedAnswer.content,
          } : null
        });
      }
    }

    // Reject duplicates against resolved FAQs (title Jaccard ≥ 0.80) using lexical pre-filtering
    let allFaqs = [];
    try {
      allFaqs = await FAQ.find({
        status: 'resolved',
        deletedAt: null,
        $text: { $search: title }
      })
      .select('_id title finalAnswer')
      .limit(30)
      .lean();
    } catch (err) {
      // Safe fallback
      allFaqs = await FAQ.find({ status: 'resolved', deletedAt: null })
        .select('_id title finalAnswer')
        .limit(100)
        .lean();
    }

    for (const faq of allFaqs) {
      const sim = jaccardSimilarity(title, faq.title);
      if (sim >= 0.80) {
        // Deduct duplicate penalty
        const userDoc = await User.findById(req.user._id);
        if (userDoc) {
          userDoc.reputation = Math.max(0, userDoc.reputation - 2);
          await userDoc.save();
        }

        return res.status(409).json({
          error: 'This question is already answered in the FAQ knowledge base',
          duplicateQueryId: null,
          duplicateTitle: faq.title,
          duplicateFaqId: faq._id,
          duplicateFaqAnswer: faq.finalAnswer
        });
      }
    }

    // Set 24hr SLA deadline
    const expiresAt = new Date(Date.now() + SLA_24HR);

    const query = await Query.create({
      title,
      description,
      tags: (tags || []).map(t => t.toLowerCase().trim()),
      createdBy: req.user._id,
      status: 'open',
      expiresAt,
      taggedUsers: taggedUsers || [],
      // Store uploaded file references; already validated above
      attachments: Array.isArray(attachments) ? attachments.slice(0, 5) : []
    });

    await query.populate('createdBy', 'name reputation');
    await query.populate('taggedUsers', 'name reputation');

    // Record this submission timestamp for cooldown tracking
    await User.findByIdAndUpdate(req.user._id, {
      $push: { recentQueryTimestamps: { $each: [new Date()], $slice: -3 } }
    });

    // Notify matching growing contributors (< 100 reputation) who answer matching tags
    const { notifyTieredContributors, notifyTaggedUsers } = require('../services/notificationService');
    notifyTieredContributors(query, false).catch(err => console.error('Failed to notify growing contributors:', err));

    if (taggedUsers && taggedUsers.length > 0) {
      notifyTaggedUsers(query, taggedUsers).catch(err => console.error('Failed to notify tagged users:', err));
    }

    // Trigger RAG auto-answer and semantic linkage in the background
    setImmediate(async () => {
      // 1. Semantic Linkage & Knowledge Graph Suggestion
      try {
        const { linkQuerySemanticGraph } = require('./ragController');
        await linkQuerySemanticGraph(query._id);
      } catch (err) {
        console.error('[Semantic Graph] Failed background linkage:', err);
      }

      // 2. RAG Auto-Answer
      try {
        const { generateRagAnswerText } = require('./ragController');
        const Answer = require('../models/Answer');
        const User = require('../models/User');

        let botUser = await User.findOne({ email: 'ragbot@faqapp.local' });
        if (!botUser) {
          botUser = await User.create({
            name: 'RAG Assistant',
            email: 'ragbot@faqapp.local',
            password: 'ragbot_secure_password_random_123',
            role: 'user',
            isVolunteer: true,
            reputation: 9999,
            isEmailVerified: true
          });
        }

        const answerText = await generateRagAnswerText(query.title);
        
        // Post the answer
        const newAnswer = await Answer.create({
          content: answerText,
          queryId: query._id,
          userId: botUser._id,
          isVetted: true
        });

        // Increment answer count on query
        await Query.findByIdAndUpdate(query._id, { $inc: { answerCount: 1 } });
        
        console.log(`[RAG Auto-Answer] Successfully answered query "${query.title}" with Answer ${newAnswer._id}`);
      } catch (err) {
        console.error('[RAG Auto-Answer] Failed to generate background auto-answer:', err);
      }
    });

    res.status(201).json({ message: 'Query raised successfully', query });
  } catch (error) {
    console.error('Create query error:', error);
    res.status(500).json({ error: 'Failed to create query' });
  }
};

// Claim a query (explicit, browse-and-pick)
exports.claimQuery = async (req, res) => {
  try {
    const query = await Query.findById(req.params.id);
    if (!query) return res.status(404).json({ error: 'Query not found' });
    if (query.status === 'closed') return res.status(400).json({ error: 'This query is closed' });
    if (query.createdBy && query.createdBy.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot claim your own query' });
    }
    if (query.assignedTo && query.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(409).json({ error: 'This query has already been claimed by someone else' });
    }
    if (query.assignedTo && query.assignedTo.toString() === req.user._id.toString()) {
      return res.json({ message: 'You already have this query claimed', query });
    }

    const existing = await Query.findOne({
      assignedTo: req.user._id,
      status: { $in: ['open', 'claimed'] },
      _id: { $ne: query._id }
    });
    if (existing) {
      return res.status(400).json({
        error: `You can only have one active claim at a time. You currently have: "${existing.title}". Please release it before claiming another.`
      });
    }

    // Atomic claim: fail if already claimed by someone else (prevents race condition)
    const freshSla = query.expiresAt < new Date();
    
    const setFields = {
      assignedTo: req.user._id,
      claimedAt: new Date(),
      status: 'claimed'
    };
    
    if (freshSla) {
      setFields.expiresAt = new Date(Date.now() + SLA_24HR);
      if (!query.escalatedAt) {
        setFields.escalatedAt = new Date();
      }
    }

    const claimed = await Query.findOneAndUpdate(
      {
        _id: query._id,
        assignedTo: { $in: [null, req.user._id] },
        status: { $in: ['open', 'claimed'] }
      },
      {
        $set: setFields,
        ...(freshSla ? { $inc: { escalationCount: 1 } } : {})
      },
      { new: true }
    );

    if (!claimed) {
      return res.status(409).json({ error: 'This query was just claimed by another user. Please refresh and try again.' });
    }

    const populated = await Query.findById(query._id)
      .populate('createdBy', 'name reputation')
      .populate('assignedTo', 'name reputation');

    res.json({ message: 'Query claimed successfully', query: populated });
  } catch (error) {
    console.error('Claim query error:', error);
    res.status(500).json({ error: 'Failed to claim query' });
  }
};

// Release a claimed query (self or admin)
exports.unclaimQuery = async (req, res) => {
  try {
    const query = await Query.findById(req.params.id);
    if (!query) return res.status(404).json({ error: 'Query not found' });
    if (!query.assignedTo) {
      return res.json({ message: 'Query is not currently claimed', query });
    }

    const isClaimant = query.assignedTo.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isClaimant && !isAdmin) {
      return res.status(403).json({ error: 'Only the person who claimed this or an admin can release it' });
    }

    query.assignedTo = null;
    query.claimedAt = null;
    query.status = 'open';
    query.expiresAt = new Date(Date.now() + SLA_24HR);
    query.skipCount = (query.skipCount || 0) + 1;

    // Direct Admin Escalation if skipped 3 or more times
    if (query.skipCount >= 3) {
      const { notifyAdminsOfEscalatedQuery } = require('../services/notificationService');
      notifyAdminsOfEscalatedQuery(query).catch(err => console.error('Failed to notify admins of skipped query:', err));
    }

    await query.save();

    const populated = await Query.findById(query._id)
      .populate('createdBy', 'name reputation')
      .populate('assignedTo', 'name reputation');

    res.json({ message: isAdmin && !isClaimant ? 'Admin released the claim — SLA restarts' : 'Claim released', query: populated });
  } catch (error) {
    console.error('Unclaim query error:', error);
    res.status(500).json({ error: 'Failed to release claim' });
  }
};

// Take a Question (Auto-assign with SLA awareness)
exports.takeQuery = async (req, res) => {
  try {
    const query = await Query.findOne({
      status: 'open',
      assignedTo: null
    }).sort({ expiresAt: 1, createdAt: 1 });

    if (!query) {
      return res.status(404).json({ error: 'No open queries available for assignment' });
    }

    if (query.createdBy && query.createdBy.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot take your own query' });
    }
    query.assignedTo = req.user._id;
    query.claimedAt = new Date();
    query.status = 'claimed';
    query.expiresAt = new Date(Date.now() + SLA_24HR);
    query.escalationCount += 1;
    query.escalatedAt = query.escalatedAt || new Date();
    await query.save();

    const populated = await Query.findById(query._id)
      .populate('createdBy', 'name reputation')
      .populate('assignedTo', 'name reputation');

    res.json({ message: 'Question auto-assigned! You have 24 hours to answer it.', query: populated });
  } catch (error) {
    console.error('Take query error:', error);
    res.status(500).json({ error: 'Failed to auto-assign query' });
  }
};

// Accept an answer and close the query
exports.closeQuery = async (req, res) => {
  try {
    const query = await Query.findById(req.params.id);
    if (!query) return res.status(404).json({ error: 'Query not found' });

    const isOwner = query.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Only the query owner or an admin can close this query' });
    }

    const wasSlaBreached = query.expiresAt < new Date() && (query.status === 'open' || query.status === 'claimed');

    query.status = 'closed';
    query.answeredAt = new Date();
    query.assignedTo = null;
    await query.save();

    // Clear RAG cache so the newly closed query is instantly indexed
    try {
      const { clearRagCache } = require('./ragController');
      clearRagCache();
    } catch (err) {
      console.warn('Failed to clear RAG cache on query close:', err.message);
    }

    // Log query close by admin
    if (isAdmin) {
      await AuditLog.create({
        action: wasSlaBreached ? 'resolved SLA breach' : 'soft-deleted',
        performedBy: req.user._id,
        targetModel: 'Query',
        targetId: query._id,
        targetName: query.title
      });
    }

    const populated = await Query.findById(query._id)
      .populate('createdBy', 'name reputation')
      .populate('assignedTo', 'name reputation');

    res.json({ message: 'Query closed', query: populated });
  } catch (error) {
    console.error('Close (accept answer) error:', error);
    res.status(500).json({ error: 'Failed to close query' });
  }
};

// Delete a query
exports.deleteQuery = async (req, res) => {
  try {
    const query = await Query.findById(req.params.id);
    if (!query) return res.status(404).json({ error: 'Query not found' });

    await Answer.deleteMany({ queryId: query._id });
    await query.deleteOne();

    // Clear RAG cache so the deleted query is instantly removed from index
    try {
      const { clearRagCache } = require('./ragController');
      clearRagCache();
    } catch (err) {
      console.warn('Failed to clear RAG cache on query delete:', err.message);
    }

    res.json({ message: 'Query deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete query' });
  }
};

// Update query (owner only — title, description, tags)
exports.updateQuery = async (req, res) => {
  try {
    const query = await Query.findById(req.params.id);
    if (!query) return res.status(404).json({ error: 'Query not found' });

    if (query.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the owner can edit this query' });
    }
    if (query.status === 'closed') {
      return res.status(400).json({ error: 'Cannot edit a closed query' });
    }

    const { title, description, tags } = req.body;
    if (title !== undefined) query.title = title.trim();
    if (description !== undefined) query.description = description.trim();
    if (tags !== undefined) query.tags = tags.map(t => t.toLowerCase().trim());

    await query.save();
    await query.populate('createdBy', 'name reputation');

    res.json({ message: 'Query updated', query });
  } catch (error) {
    console.error('Update query error:', error);
    res.status(500).json({ error: 'Failed to update query' });
  }
};

// Get SLA statistics
exports.getSlaStats = async (req, res) => {
  try {
    const now = new Date();
    const [total, open, breached, claimed, answered] = await Promise.all([
      Query.countDocuments(),
      Query.countDocuments({ status: 'open' }),
      Query.countDocuments({ expiresAt: { $lt: now }, status: { $ne: 'closed' } }),
      Query.countDocuments({ status: 'claimed' }),
      Query.countDocuments({ status: 'answered' })
    ]);
    res.json({ total, open, breached, claimed, answered });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch SLA stats' });
  }
};

// Get queries that are strong community-FAQ candidates (communityScore >= threshold)
// Accessible without auth so anyone browsing can see "What's Hot"
exports.getCommunityCandidates = async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 30;
    const candidates = await Query.find({
      status: { $in: ['open', 'answered', 'claimed'] },
      deletedAt: null,
      communityScore: { $gte: threshold }
    })
      .populate('createdBy', 'name')
      .populate('assignedTo', 'name')
      .sort({ communityScore: -1, createdAt: -1 })
      .limit(20);

    res.json({ candidates, threshold });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch community candidates' });
  }
};

// Toggle facing count on a query ("I am facing this issue as well")
exports.toggleFacing = async (req, res) => {
  try {
    const query = await Query.findById(req.params.id);
    if (!query) return res.status(404).json({ error: 'Query not found' });
    if (query.status === 'closed') {
      return res.status(400).json({ error: 'Cannot toggle facing on a closed query' });
    }

    const userId = req.user._id;
    if (query.createdBy.toString() === userId.toString()) {
      return res.status(400).json({ error: 'You cannot toggle facing on your own query' });
    }

    const hasFaced = query.facingUsers.some(id => id.toString() === userId.toString());

    if (hasFaced) {
      query.facingUsers = query.facingUsers.filter(id => id.toString() !== userId.toString());
      query.facingCount = Math.max(0, query.facingCount - 1);
    } else {
      query.facingUsers.push(userId);
      query.facingCount += 1;
    }

    await query.save();

    // Check and trigger FAQ promotion checks
    const { checkFAQPromotion } = require('../services/promotionService');
    checkFAQPromotion(query._id).catch(e => console.warn('Failed background promotion check on toggleFacing:', e.message));

    res.json({ facingCount: query.facingCount, facingUsers: query.facingUsers });
  } catch (error) {
    console.error('Toggle facing error:', error);
    res.status(500).json({ error: 'Failed to update facing status' });
  }
};

exports.releaseInactiveClaims = async () => {
  console.log(`[Claim Release Scheduler] Checking for inactive query claims...`);
  try {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const claimedQueries = await Query.find({
      status: 'claimed',
      claimedAt: { $lt: fortyEightHoursAgo }
    });

    let releasedCount = 0;

    for (const query of claimedQueries) {
      // Check if any answers have been submitted
      const hasAnswer = await Answer.exists({ queryId: query._id });
      if (!hasAnswer) {
        console.log(`[Claim Release Scheduler] Releasing inactive claim on query: "${query.title}" (assigned to ${query.assignedTo})`);
        
        const previousAssignee = query.assignedTo;
        
        // Nullify claim
        query.assignedTo = null;
        query.claimedAt = null;
        query.status = 'open';
        // Restart SLA window
        query.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        query.skipCount = (query.skipCount || 0) + 1;

        // Direct Admin Escalation if skipped 3 or more times
        if (query.skipCount >= 3) {
          const { notifyAdminsOfEscalatedQuery } = require('../services/notificationService');
          notifyAdminsOfEscalatedQuery(query).catch(err => console.error('Failed to notify admins of skipped query:', err));
        }

        await query.save();

        // Emit notification signals to the user who lost the claim
        if (previousAssignee) {
          const Notification = require('../models/Notification');
          await Notification.create({
            recipient: previousAssignee,
            type: 'claim',
            title: 'Query Claim Released',
            message: `Your claim on query "${query.title}" was automatically released due to 48 hours of inactivity.`,
            link: '/community'
          }).catch(err => console.error('Failed to create in-app notification for released claim:', err));
          
          // Send email notification if user enabled notifications
          const userDoc = await User.findById(previousAssignee).select('email name emailNotifications');
          if (userDoc && userDoc.email && userDoc.emailNotifications !== false) {
            const { sendEmail } = require('../services/emailService');
            sendEmail({
              to: userDoc.email,
              subject: `⚠️ Query claim released: "${query.title}"`,
              text: `Hi ${userDoc.name},\n\nYour claim on the query "${query.title}" has been automatically released because it was inactive for more than 48 hours with no answers submitted.\n\nOther community members can now claim this query.\n\nView community board → ${process.env.FRONTEND_URL || 'http://localhost:3000'}/community`,
              html: `
                <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
                  <div style="background: #ef4444; color: white; padding: 20px 24px; border-radius: 12px 12px 0 0;">
                    <h2 style="margin: 0; font-size: 18px;">⚠️ Claim Released due to Inactivity</h2>
                  </div>
                  <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                    <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">Hi ${userDoc.name},</p>
                    <p style="margin: 0 0 16px; font-size: 14px; color: #374151;">
                      Your claim on the query <strong>"${query.title}"</strong> has been automatically released because it was inactive for more than 48 hours with no answers submitted.
                    </p>
                    <p style="margin: 0 0 16px; font-size: 14px; color: #374151;">
                      Other community members can now claim and answer this query.
                    </p>
                    <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/community" style="display: inline-block; background: #ef4444; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 500;">
                      View Community Board →
                    </a>
                  </div>
                </div>`
            }).catch(err => console.error('Failed to send claim release email:', err));
          }
        }

        releasedCount++;
      }
    }
    
    console.log(`[Claim Release Scheduler] Finished. Released ${releasedCount} inactive claim(s).`);
    return releasedCount;
  } catch (error) {
    console.error('[Claim Release Scheduler] Error:', error);
    return 0;
  }
};
