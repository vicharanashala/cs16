const FAQ = require('../models/FAQ');
const Query = require('../models/Query');
const Answer = require('../models/Answer');
const User = require('../models/User');

// Regex to detect numeric question-ID tags like "13.15", "12.1", etc.
// These are second-element tags and should not become categories
const NUMERIC_TAG_RE = /^\d+\.\d+$/;

// Categories with this many or fewer FAQs get grouped into MISC
const MISC_THRESHOLD = 2;

// Get all categories derived from FAQ sectionTitles
exports.getCategories = async (req, res) => {
  try {
    const isRecentOnly = req.query.recent === 'true';
    let categories;

    if (isRecentOnly) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Try to get categories active (viewed) in the last 7 days, sorted by view activity
      categories = await FAQ.aggregate([
        { $match: { status: 'resolved', lastViewed: { $gte: sevenDaysAgo } } },
        { $project: { firstTag: { $arrayElemAt: ['$tags', 0] }, title: 1, viewCount: 1 } },
        { $match: { firstTag: { $not: NUMERIC_TAG_RE } } },
        {
          $group: {
            _id: '$firstTag',
            count: { $sum: 1 },
            recentViews: { $sum: '$viewCount' },
            sampleFAQ: { $first: '$title' }
          }
        },
        { $sort: { recentViews: -1, count: -1, _id: 1 } }
      ]);

      // Fallback: if no FAQs were viewed in the last 7 days (e.g. fresh database seeding),
      // get all active categories sorted by total viewCount / sizes so the dashboard has rich content!
      if (categories.length === 0) {
        categories = await FAQ.aggregate([
          { $match: { status: 'resolved' } },
          { $project: { firstTag: { $arrayElemAt: ['$tags', 0] }, title: 1, viewCount: 1 } },
          { $match: { firstTag: { $not: NUMERIC_TAG_RE } } },
          {
            $group: {
              _id: '$firstTag',
              count: { $sum: 1 },
              recentViews: { $sum: '$viewCount' },
              sampleFAQ: { $first: '$title' }
            }
          },
          { $sort: { recentViews: -1, count: -1, _id: 1 } }
        ]);
      }
    } else {
      // Standard: return all resolved categories (unfiltered by time), sorted by size/count
      categories = await FAQ.aggregate([
        { $match: { status: 'resolved' } },
        // Project only the first tag (index 0) — the section category tag
        { $project: { firstTag: { $arrayElemAt: ['$tags', 0] }, title: 1 } },
        // Filter out any firstTag that matches the numeric question-ID pattern
        { $match: { firstTag: { $not: NUMERIC_TAG_RE } } },
        {
          $group: {
            _id: '$firstTag',
            count: { $sum: 1 },
            sampleFAQ: { $first: '$title' }
          }
        },
        { $sort: { count: -1, _id: 1 } }
      ]);
    }

    // Separate main categories from rare ones (≤2 FAQs) to group under MISC
    const mainCategories = [];
    let miscCount = 0;
    let miscSample = null;

    for (const c of categories) {
      if (c.count <= MISC_THRESHOLD) {
        miscCount += c.count;
        miscSample = miscSample || c.sampleFAQ;
      } else {
        mainCategories.push({
          id: c._id,
          name: formatCategoryName(c._id),
          tag: c._id,
          count: c.count
        });
      }
    }

    // Build final list: main categories first, then MISC if applicable
    const categoryList = mainCategories;

    if (miscCount > 0) {
      categoryList.push({
        id: 'misc',
        name: 'MISC',
        tag: 'misc',
        count: miscCount,
        sampleFAQ: miscSample
      });
    }

    res.json(categoryList);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

// Get FAQs by category tag
exports.getFAQsByCategory = async (req, res) => {
  try {
    const { tag } = req.params;
    const { page = 1, limit = 20, sort } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query;
    if (tag === 'misc') {
      // MISC: collect FAQs from categories with ≤2 items each
      const allCategories = await FAQ.aggregate([
        { $match: { status: 'resolved' } },
        { $project: { firstTag: { $arrayElemAt: ['$tags', 0] }, title: 1, tags: 1 } },
        { $match: { firstTag: { $not: NUMERIC_TAG_RE } } },
        {
          $group: {
            _id: '$firstTag',
            count: { $sum: 1 }
          }
        },
        { $match: { count: { $lte: MISC_THRESHOLD } } }
      ]);
      const miscTags = allCategories.map(c => c._id);
      query = { status: 'resolved', tags: { $in: miscTags } };
    } else {
      query = { status: 'resolved', tags: tag };
    }

    let sortOption = {};
    if (sort === 'popular') {
      sortOption = { upvotes: -1, createdAt: -1 };
    } else {
      sortOption = { createdAt: -1 };
    }

    const [faqs, total] = await Promise.all([
      FAQ.find(query)
        .populate('createdBy', 'name')
        .sort(sortOption)
        .skip(skip)
        .limit(parseInt(limit)),
      FAQ.countDocuments(query)
    ]);

    res.json({
      faqs,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch FAQs' });
  }
};

function formatCategoryName(tag) {
  // Convert "about-the-internship" to "About The Internship"
  return tag
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Get top contributors for category
exports.getCategoryContributors = async (req, res) => {
  try {
    const { tag } = req.params;
    const { week } = req.query;

    // Find queries that have the category tag
    const queryIds = await Query.find({ tags: tag, deletedAt: null }).distinct('_id');

    let answerMatch = { queryId: { $in: queryIds }, deletedAt: null };

    // If week filter is true, consider answers from the last 7 days
    if (week === 'true') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      answerMatch.createdAt = { $gte: sevenDaysAgo };
    }

    // Aggregate answers to find top responders
    let topResponders = await Answer.aggregate([
      { $match: answerMatch },
      {
        $group: {
          _id: '$userId',
          answerCount: { $sum: 1 },
          acceptedCount: { $sum: { $cond: ['$isAccepted', 1, 0] } },
          upvotesCount: { $sum: '$upvotes' }
        }
      },
      {
        $addFields: {
          score: {
            $add: [
              { $multiply: ['$answerCount', 5] },
              { $multiply: ['$acceptedCount', 15] },
              { $multiply: ['$upvotesCount', 2] }
            ]
          }
        }
      },
      { $sort: { score: -1, upvotesCount: -1 } },
      { $limit: 3 }
    ]);

    // Fallback: If we wanted week activity but got fewer than 3, grab all-time contributors
    if (week === 'true' && topResponders.length < 3) {
      const existingIds = topResponders.map(r => r._id);
      const fallbackResponders = await Answer.aggregate([
        { $match: { queryId: { $in: queryIds }, userId: { $nin: existingIds }, deletedAt: null } },
        {
          $group: {
            _id: '$userId',
            answerCount: { $sum: 1 },
            acceptedCount: { $sum: { $cond: ['$isAccepted', 1, 0] } },
            upvotesCount: { $sum: '$upvotes' }
          }
        },
        {
          $addFields: {
            score: {
              $add: [
                { $multiply: ['$answerCount', 5] },
                { $multiply: ['$acceptedCount', 15] },
                { $multiply: ['$upvotesCount', 2] }
              ]
            }
          }
        },
        { $sort: { score: -1, upvotesCount: -1 } },
        { $limit: 3 - topResponders.length }
      ]);
      topResponders = [...topResponders, ...fallbackResponders];
    }

    // Populate user info
    const userIds = topResponders.map(r => r._id);
    const users = await User.find({ _id: { $in: userIds }, status: 'active', email: { $ne: 'ragbot@faqapp.local' } })
      .select('name reputation role')
      .lean();

    // Maintain sorting based on aggregate score
    let populated = topResponders.map(resp => {
      const u = users.find(user => user._id.toString() === resp._id.toString());
      if (!u) return null;
      return {
        ...u,
        score: resp.score,
        answerCount: resp.answerCount,
        acceptedCount: resp.acceptedCount,
        upvotesCount: resp.upvotesCount
      };
    }).filter(Boolean);

    // Fallback to top general users if still fewer than 3
    if (populated.length < 3) {
      const populatedIds = populated.map(p => p._id.toString());
      const generalActive = await User.find({
        _id: { $nin: populatedIds },
        status: 'active',
        role: 'user',
        email: { $ne: 'ragbot@faqapp.local' }
      })
      .sort({ reputation: -1 })
      .limit(3 - populated.length)
      .select('name reputation role')
      .lean();

      populated.push(...generalActive.map(u => ({
        ...u,
        score: 0,
        answerCount: 0,
        acceptedCount: 0,
        upvotesCount: 0
      })));
    }

    res.json(populated.slice(0, 3));
  } catch (error) {
    console.error('Error fetching category contributors:', error);
    res.status(500).json({ error: 'Failed to fetch category contributors' });
  }
};