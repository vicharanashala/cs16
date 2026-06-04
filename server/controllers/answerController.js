const Answer = require('../models/Answer');
const Query = require('../models/Query');
const FAQ = require('../models/FAQ');
const FAQRequest = require('../models/FAQRequest');
const User = require('../models/User');
const UpvoteLog = require('../models/UpvoteLog');
const { notifyQueryOwnerOfAnswer } = require('../services/emailService');

// Threshold for auto-promoting an accepted answer to a pending FAQ request
const COMMUNITY_FAQ_UPVOTE_THRESHOLD = 5;

// ─── Submit an answer ──────────────────────────────────────────────────────────

exports.createAnswer = async (req, res) => {
  try {
    const { content, queryId } = req.body;

    if (!content || !queryId) {
      return res.status(400).json({ error: 'Content and queryId are required' });
    }

    const query = await Query.findById(queryId);
    if (!query) return res.status(404).json({ error: 'Query not found' });
    if (query.status === 'closed') return res.status(400).json({ error: 'This query is closed' });
    // Admins can add answers to 'answered' queries (e.g. to provide a better answer)
    if (query.status === 'answered' && req.user.role !== 'admin') {
      return res.status(400).json({ error: 'This query already has an accepted answer' });
    }
    if (query.answerCount >= 5) return res.status(400).json({ error: 'This query already has 5 answers' });

    const author = await User.findById(req.user._id).select('reputation role');
    const isVetted = author ? (author.reputation >= 50 || author.role === 'admin') : true;

    const answer = await Answer.create({
      content,
      queryId,
      userId: req.user._id,
      isVetted
    });

    query.answerCount = (query.answerCount || 0) + 1;
    // Only promote to 'answered' when the claim-holder submits their answer
    // (signal to owner: your claim-holder has responded, please review)
    if (query.status === 'claimed' && req.user._id.toString() === query.assignedTo?.toString()) {
      query.status = 'answered';
    }
    // Refresh activity window on the query when claim-holder submits an answer
    if (query.status === 'claimed' || query.status === 'answered') {
      query.lastActivityAt = new Date();
    }
    await query.save();

    await User.findByIdAndUpdate(req.user._id, { $inc: { answersGiven: 1 } });

    await answer.populate('userId', 'name reputation');

    // Notify query owner (unless they answered their own query)
    if (query.createdBy.toString() !== req.user._id.toString()) {
      const queryOwner = await User.findById(query.createdBy).select('email name emailNotifications');
      notifyQueryOwnerOfAnswer({
        queryOwner,
        queryTitle: query.title,
        answerAuthorName: answer.userId.name,
        answerContent: answer.content,
        queryId: query._id
      }).catch(err => console.error('Failed to send answer notification:', err.message));
    }

    res.status(201).json({ message: 'Answer added', answer });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit answer' });
  }
};

// ─── Get answers for a query ──────────────────────────────────────────────────

exports.getAnswers = async (req, res) => {
  try {
    const answers = await Answer.find({
  queryId: req.params.queryId,
  deletedAt: null
})
      .populate('userId', 'name reputation tags')
      .sort({ upvotes: -1, createdAt: 1 });
    res.json({ answers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch answers' });
  }
};

// ─── Upvote an answer (toggle) ─────────────────────────────────────────────────

exports.upvoteAnswer = async (req, res) => {
  try {
    const answer = await Answer.findById(req.params.id);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    const userId = req.user._id;

    if (answer.userId.toString() === userId.toString()) {
      return res.status(400).json({ error: 'You cannot upvote your own answer' });
    }

    if (answer.upvotedBy.includes(userId)) {
      // Remove upvote
      answer.upvotes -= 1;
      answer.upvotedBy = answer.upvotedBy.filter(id => id.toString() !== userId.toString());
      // Reverse the +2 rep awarded on upvote
      await User.findByIdAndUpdate(answer.userId, { $inc: { reputation: -2 } });
      // Reverse the +3 communityScore per removed upvote
      await Query.findByIdAndUpdate(answer.queryId, { $inc: { communityScore: -3 } });
      
      // Delete the upvote log
      await UpvoteLog.findOneAndDelete({ upvoterId: userId, answerId: answer._id });
    } else {
      // Enforce peer-to-peer anti-collusion: max 2 upvotes from upvoter to target author in the last 24h
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const count = await UpvoteLog.countDocuments({
        upvoterId: userId,
        targetUserId: answer.userId,
        createdAt: { $gte: twentyFourHoursAgo }
      });

      if (count >= 2) {
        return res.status(400).json({ error: 'Upvote limit exceeded for this contributor in the last 24 hours.' });
      }

      // Add upvote
      answer.upvotes += 1;
      answer.upvotedBy.push(userId);
      // +2 rep to answer author per upvote
      await User.findByIdAndUpdate(answer.userId, { $inc: { reputation: 2 } });
      // +3 communityScore per upvote for auto-FAQ promotion
      await Query.findByIdAndUpdate(answer.queryId, { $inc: { communityScore: 3 } });

      // Record the upvote log
      await UpvoteLog.create({
        upvoterId: userId,
        targetUserId: answer.userId,
        answerId: answer._id
      });
    }

    await answer.save();
    // Touch activity window on the query so claim doesn't go stale while there is engagement
    await Query.findByIdAndUpdate(answer.queryId, { lastActivityAt: new Date() });
    res.json({ upvotes: answer.upvotes, upvotedBy: answer.upvotedBy });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upvote' });
  }
};

// ─── Accept an answer ──────────────────────────────────────────────────────────

exports.acceptAnswer = async (req, res) => {
  try {
    const answer = await Answer.findById(req.params.id);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    const query = await Query.findById(answer.queryId);
    if (!query) return res.status(404).json({ error: 'Query not found' });

    // Only query owner can accept
    if (query.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only query owner can accept an answer' });
    }

    // Unaccept the previously accepted answer (if any)
    const currentAccepted = await Answer.findOne({ queryId: query._id, isAccepted: true });
    if (currentAccepted) {
      currentAccepted.isAccepted = false;
      await currentAccepted.save();

      // Reverse exact rep awarded from previously accepted answer
      const repToDeduct = currentAccepted.acceptedRepAwarded || 20;
      await User.findByIdAndUpdate(currentAccepted.userId, { $inc: { reputation: -repToDeduct } });

      // Reverse the acceptedAnswersCount bonus
      await User.findByIdAndUpdate(currentAccepted.userId, { $inc: { acceptedAnswersCount: -1 } });

      // If it was converted to a FAQ, unlink it
      await FAQ.updateMany(
        { resolvedFAQ: currentAccepted._id },
        { $set: { resolvedFAQ: null } }
      );
    }

    // Calculate if query is escalated (older than 12 hours or has SLA breaches)
    const isEscalated = query.escalationCount > 0 || (Date.now() - new Date(query.createdAt)) >= 12 * 60 * 60 * 1000;
    const repToAward = isEscalated ? 40 : 20;

    // Accept the new answer
    answer.isAccepted = true;
    answer.acceptedAt = new Date();
    answer.acceptedRepAwarded = repToAward;
    await answer.save();

    // Award rep to answer author (Double if escalated)
    await User.findByIdAndUpdate(answer.userId, { $inc: { reputation: repToAward } });

    // Increment acceptedAnswersCount on the User model
    await User.findByIdAndUpdate(answer.userId, { $inc: { acceptedAnswersCount: 1 } });

    // Mark query as closed
    query.status = 'closed';
    query.answeredAt = new Date();
    query.resolvedFAQ = null;
    await query.save();

    // Clear RAG cache so the newly closed query is instantly indexed
    try {
      const { clearRagCache } = require('./ragController');
      clearRagCache();
    } catch (err) {
      console.warn('Failed to clear RAG cache on answer accept:', err.message);
    }

    // Auto-promote high-confidence community answers to FAQ request
    if (answer.upvotes >= COMMUNITY_FAQ_UPVOTE_THRESHOLD) {
      const existingRequest = await FAQRequest.findOne({ answerId: answer._id, status: 'pending' });
      if (!existingRequest) {
        await FAQRequest.create({
          queryId: query._id,
          answerId: answer._id,
          submittedBy: answer.userId,
          proposedQuestion: query.title,
          proposedAnswer: answer.content,
          proposedTags: query.tags || []
        });
      }
    }

    res.json({ message: 'Answer accepted', answer });
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept answer' });
  }
};

// ─── Convert answer to FAQ ────────────────────────────────────────────────────

exports.convertAnswerToFAQ = async (req, res) => {
  try {
    const answer = await Answer.findById(req.params.id).populate('userId', 'name reputation');
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    const { title, tags, description } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    // Convert into a public FAQ
    const faq = await FAQ.create({
      title,
      description: description || answer.content,
      finalAnswer: answer.content,
      tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
      createdBy: answer.userId._id,
      sourceQuery: answer.queryId,
      status: 'resolved'
    });

    // Mark query as closed/resolved
    await Query.findByIdAndUpdate(answer.queryId, {
      status: 'closed',
      resolvedFAQ: faq._id
    });

    // Clear RAG cache so the newly created FAQ is instantly indexed
    try {
      const { clearRagCache } = require('./ragController');
      clearRagCache();
    } catch (err) {
      console.warn('Failed to clear RAG cache on convert to FAQ:', err.message);
    }

    res.status(201).json({ message: 'FAQ created from answer', faq });
  } catch (error) {
    res.status(500).json({ error: 'Failed to convert to FAQ' });
  }
};

// ─── Edit an answer ───────────────────────────────────────────────────────────

exports.editAnswer = async (req, res) => {
  try {
    const answer = await Answer.findById(req.params.id);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    if (answer.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });

    answer.content = content;
    await answer.save();

    // Clear RAG cache so the edited answer is instantly updated in index
    try {
      const { clearRagCache } = require('./ragController');
      clearRagCache();
    } catch (err) {
      console.warn('Failed to clear RAG cache on answer edit:', err.message);
    }

    await answer.populate('userId', 'name reputation');

    res.json(answer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to edit answer' });
  }
};

// ─── Delete an answer (hard delete — reverse all rep effects) ─────────────────

exports.deleteAnswer = async (req, res) => {
  try {
    const answer = await Answer.findById(req.params.id);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    if (answer.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Decrement answer count on query
    const query = await Query.findById(answer.queryId);
    if (query) {
      // Revert answered status back to claimed if this was the claim-holder's first answer
      if (query.status === 'answered' && answer.userId.toString() === query.assignedTo?.toString()) {
        query.status = 'claimed';
      }
      query.answerCount = Math.max(0, query.answerCount - 1);
      if (query.answerCount === 0) query.status = 'open';
      await query.save();
    }

    // Reverse upvote rep: answer author received +2 per upvote, so reverse all of it
    if (answer.upvotes > 0 && answer.upvotedBy && answer.upvotedBy.length > 0) {
      await User.findByIdAndUpdate(answer.userId, { $inc: { reputation: -(2 * answer.upvotes) } });
    }

    // Reverse accepted answer rep bonus
    if (answer.isAccepted) {
      const repToDeduct = answer.acceptedRepAwarded || 20;
      await User.findByIdAndUpdate(answer.userId, { $inc: { reputation: -repToDeduct } });
      // Also reverse the answer count bonus received on accept
      await User.findByIdAndUpdate(answer.userId, { $inc: { acceptedAnswersCount: -1 } });
    }

    // Reverse vetted answer rep bonus (anti-abuse patch)
    if (answer.isVetted) {
      const repToDeduct = answer.vettedRepAwarded || 5;
      await User.findByIdAndUpdate(answer.userId, { $inc: { reputation: -repToDeduct } });
    }

    // Reverse upvote community score (+3 per upvote that was removed on answer)
    if (answer.upvotes > 0 && answer.upvotedBy && answer.upvotedBy.length > 0) {
      await Query.findByIdAndUpdate(answer.queryId, { $inc: { communityScore: -(3 * answer.upvotedBy.length) } });
    }

    // Reverse accepted answer community score bonus (+15)
    if (answer.isAccepted) {
      await Query.findByIdAndUpdate(answer.queryId, { $inc: { communityScore: -15 } });
    }

    // Reverse answersGiven counter (set on createAnswer)
    await User.findByIdAndUpdate(answer.userId, { $inc: { answersGiven: -1 } });

    // Clean up upvote logs for this answer
    await UpvoteLog.deleteMany({ answerId: answer._id });

    await answer.deleteOne();

    // Clear RAG cache so the deleted answer/query state is instantly updated in index
    try {
      const { clearRagCache } = require('./ragController');
      clearRagCache();
    } catch (err) {
      console.warn('Failed to clear RAG cache on answer delete:', err.message);
    }


    res.json({ message: 'Answer deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete answer' });
  }
};

// ─── Vet an answer ────────────────────────────────────────────────────────────

exports.vetAnswer = async (req, res) => {
  try {
    const answer = await Answer.findById(req.params.id);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    if (answer.isVetted) {
      return res.status(400).json({ error: 'Answer is already verified' });
    }

    // Must be admin or have reputation >= 100
    if (req.user.role !== 'admin' && req.user.reputation < 100) {
      return res.status(403).json({ error: 'Only admins or contributors with 100+ reputation can verify answers' });
    }

    // Calculate if query is escalated (older than 12 hours or has SLA breaches)
    const query = await Query.findById(answer.queryId);
    const isEscalated = query && (query.escalationCount > 0 || (Date.now() - new Date(query.createdAt)) >= 12 * 60 * 60 * 1000);
    const repToAward = isEscalated ? 10 : 5;

    answer.isVetted = true;
    answer.vettedRepAwarded = repToAward;
    await answer.save();

    // Award reputation to the answer author (Double if escalated)
    await User.findByIdAndUpdate(answer.userId, { $inc: { reputation: repToAward } });

    await answer.populate('userId', 'name reputation');

    res.json({ message: 'Answer successfully verified', answer });
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify answer' });
  }
};
