const FAQ = require('../models/FAQ');
const Query = require('../models/Query');
const Answer = require('../models/Answer');
const FAQRequest = require('../models/FAQRequest');
const User = require('../models/User');
const Pin = require('../models/Pin');
const AuditLog = require('../models/AuditLog');

// ─── FAQ History (for audit trail) ────────────────────────────────────────────

const FAQHistory = require('../models/FAQHistory');

// ─── Get All FAQs (Admin view with pagination & filtering) ────────────────────

exports.getAdminFaqs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,      // e.g. 'resolved', 'duplicate', 'deleted'
      search,
      tag
    } = req.query;

    const filter = {};
    if (status) {
      if (status === 'deleted') {
        filter.deletedAt = { $ne: null };
      } else {
        filter.status = status;
        if (status !== 'deleted') filter.deletedAt = null;
      }
    } else {
      // Default: only non-deleted FAQs
      filter.deletedAt = null;
    }

    if (tag) filter.tags = tag;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { finalAnswer: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [faqs, total] = await Promise.all([
      FAQ.find(filter)
        .populate('mergedFrom', 'title')
        .populate('mergedInto', 'title')
        .populate('duplicateOf', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      FAQ.countDocuments(filter)
    ]);

    res.json({
      faqs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('getAdminFaqs error:', error);
    res.status(500).json({ error: 'Failed to fetch FAQs' });
  }
};

// ─── Patch FAQ (update finalAnswer with audit trail, or soft-delete/restore) ──

exports.patchFaq = async (req, res) => {
  try {
    const { id } = req.params;
    const { finalAnswer, status, deletedAt } = req.body;

    const faq = await FAQ.findById(id);
    if (!faq) return res.status(404).json({ error: 'FAQ not found' });

    // ── Soft-delete / Restore ──────────────────────────────────────────────────
    if (typeof deletedAt !== 'undefined' || status) {
      if (deletedAt === null || status === 'resolved') {
        // Restore
        faq.deletedAt = null;
        faq.status = status || 'resolved';
        await faq.save();
        return res.json({ message: 'FAQ restored', faq });
      } else {
        // Soft-delete
        faq.deletedAt = deletedAt !== undefined ? deletedAt : new Date();
        faq.status = status || 'deleted';
        await faq.save();
        return res.json({ message: 'FAQ deleted', faq });
      }
    }

    // ── Update finalAnswer with FAQHistory audit trail ─────────────────────────
    if (finalAnswer !== undefined) {
      const history = new FAQHistory({
        faq: faq._id,
        editedBy: req.user._id,
        previousTitle: faq.title,
        previousDescription: faq.description,
        previousFinalAnswer: faq.finalAnswer,
        previousTags: [...(faq.tags || [])],
        newTitle: faq.title,
        newDescription: faq.description,
        newFinalAnswer: finalAnswer,
        newTags: [...(faq.tags || [])],
        reason: req.body.reason || 'admin patch'
      });
      await history.save();

      faq.finalAnswer = finalAnswer;
      await faq.save();
      return res.json({ message: 'FAQ updated', faq, history });
    }

    // ── General status update (no audit needed for status alone) ───────────────
    if (status) {
      faq.status = status;
      await faq.save();
      return res.json({ message: 'FAQ status updated', faq });
    }

    res.status(400).json({ error: 'No valid update fields provided' });
  } catch (error) {
    console.error('patchFaq error:', error);
    res.status(500).json({ error: 'Failed to patch FAQ' });
  }
};

// ─── Pin / Unpin FAQ ──────────────────────────────────────────────────────────

exports.pinFAQ = async (req, res) => {
  try {
    const faq = await FAQ.findById(req.params.id);
    if (!faq) return res.status(404).json({ error: 'FAQ not found' });

    faq.pinned = faq.pinned ? false : true;
    await faq.save();

    res.json({ message: faq.pinned ? 'FAQ pinned' : 'FAQ unpinned', pinned: faq.pinned });
  } catch (error) {
    res.status(500).json({ error: 'Failed to pin FAQ' });
  }
};

// ─── Merge FAQs ────────────────────────────────────────────────────────────────

exports.mergeFAQs = async (req, res) => {
  try {
    const { sourceId, targetId } = req.body;
    if (!sourceId || !targetId) {
      return res.status(400).json({ error: 'sourceId and targetId are required' });
    }
    if (sourceId === targetId) {
      return res.status(400).json({ error: 'Cannot merge a FAQ with itself' });
    }

    const sourceFAQ = await FAQ.findById(sourceId);
    const targetFAQ = await FAQ.findById(targetId);
    if (!sourceFAQ || !targetFAQ) {
      return res.status(404).json({ error: 'One or both FAQs not found' });
    }

    // Merge tags (deduplicate, lowercase)
    const mergedTags = [...new Set([
      ...(sourceFAQ.tags || []),
      ...(targetFAQ.tags || [])
    ].map(t => t.toLowerCase()))];

    // Move related FAQs from source into target
    const sourceRelated = sourceFAQ.relatedFAQs || [];
    const targetRelated = targetFAQ.relatedFAQs || [];
    const allRelated = [...new Set([...sourceRelated, ...targetRelated])];

    // Update target FAQ
    targetFAQ.tags = mergedTags;
    targetFAQ.relatedFAQs = allRelated;
    // Take the best title and description between the two
    if (sourceFAQ.title !== targetFAQ.title) {
      targetFAQ.title = `${targetFAQ.title} / ${sourceFAQ.title}`;
    }
    if (sourceFAQ.description !== targetFAQ.description) {
      targetFAQ.description = [targetFAQ.description, sourceFAQ.description]
        .filter(Boolean)
        .join(' || ');
    }
    // Log source as merged into target
    targetFAQ.mergedFrom = sourceFAQ._id;
    await targetFAQ.save();

    // Soft-delete the source FAQ (as duplicate)
    sourceFAQ.status = 'duplicate';
    sourceFAQ.mergedInto = targetFAQ._id;
    sourceFAQ.duplicateOf = targetFAQ._id;
    await sourceFAQ.save();

    // Update any related FAQ refs pointing to source → point to target
    await FAQ.updateMany(
      { relatedFAQs: sourceFAQ._id },
      { $addToSet: { relatedFAQs: targetFAQ._id } }
    );

    res.json({
      message: 'FAQs merged successfully',
      mergedFAQ: targetFAQ,
      duplicateFAQ: sourceFAQ
    });
  } catch (error) {
    console.error('Merge FAQs error:', error);
    res.status(500).json({ error: 'Failed to merge FAQs' });
  }
};

// ─── Edit FAQ finalAnswer (with audit trail) ──────────────────────────────────

exports.editFAQFinalAnswer = async (req, res) => {
  try {
    const { id } = req.params;
    const { finalAnswer, reason } = req.body;
    if (!finalAnswer) return res.status(400).json({ error: 'finalAnswer is required' });

    const faq = await FAQ.findById(id);
    if (!faq) return res.status(404).json({ error: 'FAQ not found' });

    // Store history snapshot before update
    const history = new FAQHistory({
      faq: faq._id,
      editedBy: req.user._id,
      previousTitle: faq.title,
      previousDescription: faq.description,
      previousFinalAnswer: faq.finalAnswer,
      previousTags: [...(faq.tags || [])],
      newTitle: faq.title,
      newDescription: faq.description,
      newFinalAnswer: finalAnswer,
      newTags: [...(faq.tags || [])],
      reason: reason || 'admin edit'
    });
    await history.save();

    // Apply update
    faq.finalAnswer = finalAnswer;
    await faq.save();

    res.json({ message: 'FAQ updated', faq, history });
  } catch (error) {
    console.error('Edit FAQ error:', error);
    res.status(500).json({ error: 'Failed to update FAQ' });
  }
};

// ─── Delete / Restore FAQ ──────────────────────────────────────────────────────

exports.deleteFAQ = async (req, res) => {
  try {
    const faq = await FAQ.findById(req.params.id);
    if (!faq) return res.status(404).json({ error: 'FAQ not found' });

    if (faq.deletedAt) {
      // Restore
      faq.deletedAt = null;
      faq.status = 'resolved';
      await faq.save();

      await AuditLog.create({
        action: 'restored',
        performedBy: req.user._id,
        targetModel: 'FAQ',
        targetId: faq._id,
        targetName: faq.title
      });

      return res.json({ message: 'FAQ restored', faq });
    }

    // Soft-delete
    faq.deletedAt = new Date();
    faq.status = 'deleted';
    await faq.save();

    await AuditLog.create({
      action: 'soft-deleted',
      performedBy: req.user._id,
      targetModel: 'FAQ',
      targetId: faq._id,
      targetName: faq.title
    });

    res.json({ message: 'FAQ deleted', faq });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete FAQ' });
  }
};

// ─── Delete any Answer ─────────────────────────────────────────────────────────

exports.deleteAnswer = async (req, res) => {
  try {
    const answer = await Answer.findById(req.params.id);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    if (answer.deletedAt) {
      // Restore
      answer.deletedAt = null;
      await answer.save();
      return res.json({ message: 'Answer restored', answer });
    }

    // Soft-delete
    answer.deletedAt = new Date();
    await answer.save();

    // Update query answer count
    const query = await Query.findById(answer.queryId);
    if (query) {
      query.answerCount = Math.max(0, (query.answerCount || 1) - 1);
      if (query.answerCount === 0) query.status = 'open';
      await query.save();
    }

    // Deduct garbage answer penalty (-15 rep)
    const author = await User.findById(answer.userId);
    if (author) {
      author.reputation = Math.max(0, author.reputation - 15);
      await author.save();
    }

    res.json({ message: 'Answer deleted', answer });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete answer' });
  }
};

// ─── Delete any Query ────────────────────────────────────────────────────────────

exports.deleteQuery = async (req, res) => {
  try {
    const query = await Query.findById(req.params.id);
    if (!query) return res.status(404).json({ error: 'Query not found' });

    if (query.deletedAt) {
      query.deletedAt = null;
      await query.save();

      // Log query restore
      await AuditLog.create({
        action: 'restored',
        performedBy: req.user._id,
        targetModel: 'Query',
        targetId: query._id,
        targetName: query.title
      });

      return res.json({ message: 'Query restored', query });
    }

    const wasSlaBreached = query.expiresAt < new Date() && (query.status === 'open' || query.status === 'claimed');

    query.deletedAt = new Date();
    query.status = 'closed';
    await query.save();

    // Deduct garbage query penalty (-10 rep)
    const author = await User.findById(query.createdBy);
    if (author) {
      author.reputation = Math.max(0, author.reputation - 10);
      await author.save();
    }

    // Log query deletion / SLA breach resolution
    await AuditLog.create({
      action: wasSlaBreached ? 'resolved SLA breach' : 'soft-deleted',
      performedBy: req.user._id,
      targetModel: 'Query',
      targetId: query._id,
      targetName: query.title
    });

    res.json({ message: 'Query deleted', query });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete query' });
  }
};

// ─── Bulk User Actions ────────────────────────────────────────────────────────
// PATCH /api/admin/users/bulk
// Body: { userIds: [...], action: 'ban' | 'unban' | 'promote' }
exports.bulkUserAction = async (req, res) => {
  try {
    const { userIds, action } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds must be a non-empty array' });
    }
    if (!['ban', 'unban', 'promote'].includes(action)) {
      return res.status(400).json({ error: 'action must be one of: ban, unban, promote' });
    }

    let update = {};
    if (action === 'ban')     update = { status: 'banned' };
    if (action === 'unban')   update = { status: 'active' };
    if (action === 'promote') update = { role: 'admin' };

    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { $set: update }
    );

    res.json({
      message: `${action} applied to ${result.modifiedCount} user(s)`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('bulkUserAction error:', error);
    res.status(500).json({ error: 'Failed to apply bulk action' });
  }
};

// ─── Analytics ──────────────────────────────────────────────────────────────────

exports.getAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [
      totalFAQs, totalQueries, totalAnswers, totalUsers,
      newFAQsThisMonth, newQueriesThisMonth, newAnswersThisMonth,
      newUsersThisMonth,
      openQueries, slaBreachedQueries,
      popularTags,
      topContributors
    ] = await Promise.all([
      FAQ.countDocuments({ status: 'resolved', deletedAt: null }),
      Query.countDocuments({ deletedAt: null }),
      Answer.countDocuments({ deletedAt: null }),
      User.countDocuments({ status: { $ne: 'banned' } }),
      FAQ.countDocuments({ createdAt: { $gte: thirtyDaysAgo }, status: 'resolved' }),
      Query.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Answer.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Query.countDocuments({ status: 'open', deletedAt: null }),
      Query.countDocuments({ status: 'open', expiresAt: { $lt: now }, deletedAt: null }),
      FAQ.aggregate([
        { $match: { status: 'resolved', deletedAt: null } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      User.find({ status: 'active' })
        .select('name reputation answersGiven questionsAsked')
        .sort({ reputation: -1 })
        .limit(10)
    ]);

    const startDate = new Date(now);
    startDate.setUTCHours(0, 0, 0, 0);
    startDate.setUTCDate(startDate.getUTCDate() - 29);

    const dailyQueryCounts = await Query.aggregate([
      { $match: { createdAt: { $gte: startDate }, deletedAt: null } },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+00:00' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const countMap = dailyQueryCounts.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const dailyStats = [];
    for (let i = 0; i < 30; i += 1) {
      const currentDate = new Date(startDate);
      currentDate.setUTCDate(startDate.getUTCDate() + i);
      const dateString = currentDate.toISOString().slice(0, 10);
      dailyStats.push({ date: dateString, queries: countMap[dateString] || 0 });
    }

    // Weekly growth percentages
    const [
      newFAQsLastWeek, newQueriesLastWeek, newAnswersLastWeek,
      newUsersLastWeek
    ] = await Promise.all([
      FAQ.countDocuments({ createdAt: { $gte: sevenDaysAgo, $lt: thirtyDaysAgo }, status: 'resolved' }),
      Query.countDocuments({ createdAt: { $gte: sevenDaysAgo, $lt: thirtyDaysAgo } }),
      Answer.countDocuments({ createdAt: { $gte: sevenDaysAgo, $lt: thirtyDaysAgo } }),
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo, $lt: thirtyDaysAgo } })
    ]);

    const growthRate = (current, previous) => {
      if (!previous) return 100;
      return Math.round(((current - previous) / previous) * 100);
    };

    res.json({
      totals: { totalFAQs, totalQueries, totalAnswers, totalUsers },
      monthly: {
        newFAQs: newFAQsThisMonth,
        newQueries: newQueriesThisMonth,
        newAnswers: newAnswersThisMonth,
        newUsers: newUsersThisMonth
      },
      growth: {
        faqs: growthRate(newFAQsThisMonth, newFAQsLastWeek),
        queries: growthRate(newQueriesThisMonth, newQueriesLastWeek),
        answers: growthRate(newAnswersThisMonth, newAnswersLastWeek),
        users: growthRate(newUsersThisMonth, newUsersLastWeek)
      },
      openQueries,
      slaBreachedQueries,
      slaBreachRate: openQueries > 0
        ? Math.round((slaBreachedQueries / openQueries) * 100)
        : 0,
      popularTags,
      topContributors,
      dailyStats
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

// ─── SLA Stats ────────────────────────────────────────────────────────────────

exports.getSlaStats = async (req, res) => {
  try {
    const now = new Date();

    const [
      openQueries,
      claimedQueries,
      answeredQueries,
      closedQueries,
      slaBreached,
      slaBreachWithEscalation,
      avgResolutionHours
    ] = await Promise.all([
      Query.countDocuments({ status: 'open', deletedAt: null }),
      Query.countDocuments({ status: 'claimed', deletedAt: null }),
      Query.countDocuments({ status: 'answered', deletedAt: null }),
      Query.countDocuments({ status: 'closed', deletedAt: null }),
      Query.countDocuments({ status: 'open', expiresAt: { $lt: now }, deletedAt: null }),
      Query.countDocuments({ status: 'open', expiresAt: { $lt: now }, escalationCount: { $gt: 0 }, deletedAt: null }),
      Query.aggregate([
        { $match: { status: 'closed', resolvedFAQ: { $ne: null } } },
        {
          $project: {
            resolutionHours: {
              $divide: [
                { $subtract: ['$answeredAt', '$createdAt'] },
                1000 * 60 * 60
              ]
            }
          }
        },
        { $group: { _id: null, avgResolution: { $avg: '$resolutionHours' } } }
      ])
    ]);

    const totalActive = openQueries + claimedQueries + answeredQueries;
    const resolvedPercent = totalActive > 0
      ? Math.round((closedQueries / (closedQueries + totalActive)) * 100)
      : 0;

    res.json({
      open: openQueries,
      claimed: claimedQueries,
      answered: answeredQueries,
      closed: closedQueries,
      slaBreached,
      slaBreachRate: openQueries > 0 ? Math.round((slaBreached / openQueries) * 100) : 0,
      escalated: slaBreachWithEscalation,
      avgResolutionHours: avgResolutionHours[0]
        ? Math.round(avgResolutionHours[0].avgResolution * 10) / 10
        : null,
      resolvedPercent
    });
  } catch (error) {
    console.error('SLA stats error:', error);
    res.status(500).json({ error: 'Failed to fetch SLA stats' });
  }
};

// ─── Reject answer (admin override) ─────────────────────────────────────────

exports.rejectAnswer = async (req, res) => {
  try {
    const answer = await Answer.findById(req.params.id);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    if (answer.deletedAt) {
      return res.status(400).json({ error: 'Answer is already deleted' });
    }

    answer.deletedAt = new Date();
    await answer.save();

    const query = await Query.findById(answer.queryId);
    if (query) {
      query.answerCount = Math.max(0, (query.answerCount || 1) - 1);
      if (query.answerCount === 0) query.status = 'open';
      await query.save();
    }

    // Deduct garbage answer penalty (-15 rep)
    const author = await User.findById(answer.userId);
    if (author) {
      author.reputation = Math.max(0, author.reputation - 15);
      await author.save();
    }

    res.json({ message: 'Answer rejected and removed', answer });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject answer' });
  }
};

// ─── Pending moderation queue ───────────────────────────────────────────────────

exports.getModerationQueue = async (req, res) => {
  try {
    const [
      pendingFAQRequests,
      pendingQueries,   // queries that are open & unclaimed older than 24h
      recentConflicts   // recently merged or edited FAQs (last 7 days)
    ] = await Promise.all([
      FAQRequest.find({ status: 'pending' })
        .populate('submittedBy', 'name')
        .populate('queryId', 'title')
        .populate('answerId', 'content')
        .sort({ createdAt: -1 }),
      Query.find({
        status: 'open',
        expiresAt: { $lt: new Date() },
        deletedAt: null
      })
        .populate('createdBy', 'name')
        .sort({ expiresAt: 1 })
        .limit(20),
      FAQHistory.find({ createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } })
        .populate('editedBy', 'name')
        .sort({ createdAt: -1 })
        .limit(20)
    ]);

    res.json({
      pendingFAQRequests,
      slabreachedQueries: pendingQueries,
      recentEdits: recentConflicts
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch moderation queue' });
  }
};

// ─── Pin Management ─────────────────────────────────────────────────────────────

exports.getPins = async (req, res) => {
  try {
    const pins = await Pin.find({ deletedAt: null })
      .populate('pinnedBy', 'name')
      .populate('faqId', 'title finalAnswer tags')
      .sort({ order: 1, createdAt: -1 });
    res.json(pins);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pins' });
  }
};

exports.createPin = async (req, res) => {
  try {
    const { type, title, content, faqId, order } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const pin = new Pin({
      type,
      title,
      content: content || null,
      faqId: faqId || null,
      pinnedBy: user._id,
      order: order || 0
    });
    await pin.save();
    await pin.populate('pinnedBy', 'name');
    await pin.populate('faqId', 'title finalAnswer tags');

    // Log Pin creation
    await AuditLog.create({
      action: 'created pin',
      performedBy: req.user._id,
      targetModel: 'Pin',
      targetId: pin._id,
      targetName: pin.title
    });

    res.status(201).json(pin);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create pin' });
  }
};

exports.updatePin = async (req, res) => {
  try {
    const { title, content, order, type, faqId } = req.body;
    const pin = await Pin.findById(req.params.id);
    if (!pin) return res.status(404).json({ error: 'Pin not found' });
    if (title !== undefined) pin.title = title;
    if (content !== undefined) pin.content = content;
    if (order !== undefined) pin.order = order;
    if (type !== undefined) pin.type = type;
    if (faqId !== undefined) pin.faqId = faqId || null;
    await pin.save();
    await pin.populate('pinnedBy', 'name');
    await pin.populate('faqId', 'title finalAnswer tags');

    // Log Pin update
    await AuditLog.create({
      action: 'updated pin',
      performedBy: req.user._id,
      targetModel: 'Pin',
      targetId: pin._id,
      targetName: pin.title
    });

    res.json(pin);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update pin' });
  }
};

exports.deletePin = async (req, res) => {
  try {
    const pin = await Pin.findById(req.params.id);
    if (!pin) return res.status(404).json({ error: 'Pin not found' });
    pin.deletedAt = new Date();
    await pin.save();

    // Log Pin delete
    await AuditLog.create({
      action: 'deleted pin',
      performedBy: req.user._id,
      targetModel: 'Pin',
      targetId: pin._id,
      targetName: pin.title
    });

    res.json({ message: 'Pin removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete pin' });
  }
};

exports.getAdminFaqs = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search, tag } = req.query;
    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }
    if (tag) {
      query.tags = tag.toLowerCase().trim();
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [faqs, total] = await Promise.all([
      FAQ.find(query)
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      FAQ.countDocuments(query)
    ]);

    res.json({
      faqs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('getAdminFaqs error:', error);
    res.status(500).json({ error: 'Failed to fetch admin FAQs' });
  }
};

exports.patchFaq = async (req, res) => {
  try {
    const { id } = req.params;
    const { finalAnswer, deletedAt, status, title, tags } = req.body;

    const faq = await FAQ.findById(id);
    if (!faq) return res.status(404).json({ error: 'FAQ not found' });

    // Track previous state for soft-delete/restore auditing
    const wasDeleted = faq.deletedAt !== null && faq.deletedAt !== undefined;

    // Handle audit trail if finalAnswer is being changed
    if (finalAnswer !== undefined && faq.finalAnswer !== finalAnswer) {
      const history = new FAQHistory({
        faq: faq._id,
        editedBy: req.user._id,
        previousTitle: faq.title,
        previousDescription: faq.description,
        previousFinalAnswer: faq.finalAnswer,
        previousTags: [...(faq.tags || [])],
        newTitle: title || faq.title,
        newDescription: faq.description,
        newFinalAnswer: finalAnswer,
        newTags: tags ? tags.map(t => t.toLowerCase().trim()) : [...(faq.tags || [])],
        reason: 'admin patch'
      });
      await history.save();
      faq.finalAnswer = finalAnswer;
    }

    if (deletedAt !== undefined) faq.deletedAt = deletedAt;
    if (status !== undefined) faq.status = status;
    if (title !== undefined) faq.title = title;
    if (tags !== undefined) faq.tags = tags.map(t => t.toLowerCase().trim());

    await faq.save();

    const isDeleted = faq.deletedAt !== null && faq.deletedAt !== undefined;

    // Audit FAQ soft-delete / restore
    if (deletedAt !== undefined && wasDeleted !== isDeleted) {
      await AuditLog.create({
        action: isDeleted ? 'soft-deleted' : 'restored',
        performedBy: req.user._id,
        targetModel: 'FAQ',
        targetId: faq._id,
        targetName: faq.title
      });
    }

    res.json({ message: 'FAQ updated successfully', faq });
  } catch (error) {
    console.error('patchFaq error:', error);
    res.status(500).json({ error: 'Failed to patch FAQ' });
  }
};

// Get Admin Audit Logs
exports.getAuditLogs = async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .populate('performedBy', 'name')
      .sort({ timestamp: -1 })
      .limit(100);
    res.json(logs);
  } catch (error) {
    console.error('getAuditLogs error:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
};
