const FAQ = require('../models/FAQ');
const User = require('../models/User');
const Pin = require('../models/Pin');

// Get all FAQs with search, filter, pagination
exports.getFAQs = async (req, res) => {
  try {
    const { q, tag, status = 'resolved', sort = 'recent', page = 1, limit = 20, pinned } = req.query;

    const query = { status: 'resolved', deletedAt: null };

    if (pinned === 'true') {
      query.pinned = true;
    }

    // Regex-based substring search for high compatibility and partial matching
    if (q) {
      const cleanQ = q.trim();
      if (cleanQ) {
        query.$or = [
          { title: { $regex: cleanQ, $options: 'i' } },
          { description: { $regex: cleanQ, $options: 'i' } },
          { finalAnswer: { $regex: cleanQ, $options: 'i' } },
          { tags: { $regex: cleanQ, $options: 'i' } }
        ];
      }
    }

    // Tag filter
    if (tag) {
      query.tags = tag.toLowerCase();
    }

    // Build sort option
    let sortOption = {};
    if (q) {
      sortOption = { upvotes: -1, createdAt: -1 };
    } else if (sort === 'popular') {
      sortOption = { upvotes: -1, createdAt: -1 };
    } else {
      sortOption = { createdAt: -1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [faqs, total] = await Promise.all([
      FAQ.find(query)
        .populate('createdBy', 'name reputation')
        .sort(sortOption)
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
    console.error('Get FAQs error:', error);
    res.status(500).json({ error: 'Failed to fetch FAQs' });
  }
};

// Get trending FAQs — most viewed in the last 30 days
exports.getTrending = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // Only consider FAQs viewed in the last 30 days; fall back to all-time if no recent views
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const faqs = await FAQ.find({
      status: 'resolved',
      deletedAt: null,
      $or: [
        { lastViewed: { $gte: thirtyDaysAgo } },
        { viewCount: { $gt: 0 }, lastViewed: null }  // legacy FAQs never viewed but have upvotes
      ]
    })
      .populate('createdBy', 'name')
      .sort({ viewCount: -1, createdAt: -1 })
      .limit(parseInt(limit));

    res.json(faqs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trending FAQs' });
  }
};

// Get single FAQ
exports.getFAQById = async (req, res) => {
  try {
    const faq = await FAQ.findById(req.params.id)
      .populate('createdBy', 'name email reputation');

    if (!faq) {
      return res.status(404).json({ error: 'FAQ not found' });
    }


    // Dynamically compute related FAQs: share at least one tag, exclude self
    let relatedFAQs = [];
    if (faq.tags && faq.tags.length > 0) {
      relatedFAQs = await FAQ.find({
        _id: { $ne: faq._id },
        status: 'resolved',
        deletedAt: null,
        tags: { $in: faq.tags }
      })
        .select('title tags upvotes')
        .limit(5);
    }

    res.json({ ...faq.toObject(), relatedFAQs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch FAQ' });
  }
};

// Upvote a FAQ
exports.upvoteFAQ = async (req, res) => {
  try {
    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      return res.status(404).json({ error: 'FAQ not found' });
    }

    const userId = req.user._id;

    // Check if already upvoted
    if (faq.upvoters.includes(userId)) {
      // Remove upvote (toggle off)
      faq.upvotes -= 1;
      faq.upvoters = faq.upvoters.filter(id => id.toString() !== userId.toString());


      // FIX: Decrement author reputation by 2

      await User.findByIdAndUpdate(faq.createdBy, {
        $inc: { reputation: -2 }
      });
    } else {
      // Add upvote
      faq.upvotes += 1;
      faq.upvoters.push(userId);

      // Increase author reputation (+2 per upvote)
      await User.findByIdAndUpdate(faq.createdBy, {
        $inc: { reputation: 2 }
      });
    }


    await faq.save();

    res.json({
      upvotes: faq.upvotes,
      hasUpvoted: faq.upvoters.includes(userId)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upvote FAQ' });
  }
};

// Convert accepted answer to FAQ
exports.convertAnswerToFAQ = async (req, res) => {
  try {
    const Answer = require('../models/Answer');
    const Query = require('../models/Query');

    const answer = await Answer.findById(req.params.answerId)
      .populate('userId', 'name');

    if (!answer) {
      return res.status(404).json({ error: 'Answer not found' });
    }

    if (!answer.isAccepted) {
      return res.status(400).json({ error: 'Only accepted answers can be converted to FAQs' });
    }

    const query = await Query.findById(answer.queryId);
    if (!query) {
      return res.status(404).json({ error: 'Associated query not found' });
    }

    // Check if FAQ already created from this answer
    const existingFAQ = await FAQ.findOne({ sourceQuery: query._id });
    if (existingFAQ) {
      return res.status(400).json({ error: 'FAQ already created from this query' });
    }

    const faq = new FAQ({
      title: query.title,
      description: query.description,
      finalAnswer: answer.content,
      tags: query.tags,
      status: 'resolved',
      createdBy: req.user._id,
      sourceQuery: query._id
    });

    await faq.save();

    // Mark query as resolved
    query.resolvedFAQ = faq._id;
    query.status = 'closed';
    await query.save();

    res.status(201).json(faq);
  } catch (error) {
    console.error('Convert answer error:', error);
    res.status(500).json({ error: 'Failed to convert answer to FAQ' });
  }
};

// Create a new FAQ (admin or converted from query)
exports.createFAQ = async (req, res) => {
  try {
    const { title, description, finalAnswer, tags } = req.body;

    if (!title || !description || !finalAnswer) {
      return res.status(400).json({ error: 'Title, description and answer are required' });
    }

    const faq = new FAQ({
      title,
      description,
      finalAnswer,
      tags: tags ? tags.map(t => t.toLowerCase().trim()) : [],
      createdBy: req.user._id
    });

    await faq.save();

    // Update user stats
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { questionsAsked: 1 }
    });

    res.status(201).json(faq);
  } catch (error) {
    console.error('Create FAQ error:', error);
    res.status(500).json({ error: 'Failed to create FAQ' });
  }
};

// Get pins for community board
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