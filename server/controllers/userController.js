const User = require('../models/User');
const FAQ = require('../models/FAQ');
const FAQRequest = require('../models/FAQRequest');
const Query = require('../models/Query');
const Answer = require('../models/Answer');

// Get leaderboard with active weekly vs all-time timeframe logic
exports.getLeaderboard = async (req, res) => {
  try {
    const { limit = 20, timeframe = 'alltime' } = req.query;

    // ── CASE 1: WEEKLY TIMEFRAME LEADERBOARD ──
    if (timeframe === 'weekly') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Aggregation logic to compute rankings from contributions made in last 7 days
      const weeklyLeaderboard = await Answer.aggregate([
        {
          $match: {
            createdAt: { $gte: sevenDaysAgo }
          }
        },
        {
          $group: {
            _id: '$createdBy', // Grouping answers by user reference ID
            weeklyReputation: { $sum: 10 }, // Assuming 10 points per contribution/answer
            answersGiven: { $sum: 1 }
          }
        },
        { $sort: { weeklyReputation: -1 } },
        { $limit: parseInt(limit) },
        {
          $lookup: {
            from: 'users', // Matches with MongoDB collection name for Users
            localField: '_id',
            foreignField: '_id',
            as: 'userInfo'
          }
        },
        { $unwind: '$userInfo' },
        {
          $match: {
            'userInfo.status': 'active',
            'userInfo.role': { $ne: 'admin' },
            'userInfo.email': { $ne: 'ragbot@faqapp.local' }
          }
        },
        {
          $project: {
            _id: '$userInfo._id',
            name: '$userInfo.name',
            reputation: '$weeklyReputation', // Map to same field name for frontend safety
            answersGiven: '$answersGiven',
            questionsAsked: '$userInfo.questionsAsked',
            role: '$userInfo.role'
          }
        }
      ]);

      return res.json(weeklyLeaderboard);
    }

    // ── CASE 2: ALL TIME LEADERBOARD (DEFAULT LAYER RE-RETAINED) ──
    const users = await User.find({
      status: 'active',
      role: { $ne: 'admin' },
      email: { $ne: 'ragbot@faqapp.local' }
    })
      .select('name reputation questionsAsked answersGiven role')
      .sort({ reputation: -1 })
      .limit(parseInt(limit));

    res.json(users);
  } catch (error) {
    console.error('Leaderboard Fetch Crash:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard rankings' });
  }
};

// Get user profile by ID
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name reputation questionsAsked answersGiven role createdAt');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

// Update own profile
exports.updateProfile = async (req, res) => {
  try {
    const { name } = req.body;
    const user = await User.findById(req.user._id);

    if (name) user.name = name;

    await user.save();
    res.json({ message: 'Profile updated', user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Admin: Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      User.countDocuments(query)
    ]);
    res.json({ users, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// Admin: Ban/Unban user
exports.banUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Cannot ban an admin' });

    user.status = user.status === 'banned' ? 'active' : 'banned';
    await user.save();
    res.json({ message: user.status === 'banned' ? 'User banned' : 'User unbanned', user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
};

// Admin: Get admin stats dashboard
exports.getStats = async (req, res) => {
  try {
    const [totalUsers, totalFAQs, totalQueries, totalAnswers, openQueries, answeredQueries, recentQueries, pendingFaqRequests] = await Promise.all([
      User.countDocuments(),
      FAQ.countDocuments({ status: 'resolved' }),
      Query.countDocuments(),
      Answer.countDocuments(),
      Query.countDocuments({ status: 'open' }),
      Query.countDocuments({ status: 'answered' }),
      Query.find().populate('createdBy', 'name').sort({ createdAt: -1 }).limit(5),
      FAQRequest.countDocuments({ status: 'pending' })
    ]);

    res.json({
      totalUsers,
      totalFAQs,
      totalQueries,
      totalAnswers,
      openQueries,
      answeredQueries,
      recentQueries,
      pendingFaqRequests
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};

// Toggle bookmark for user
exports.toggleBookmark = async (req, res) => {
  try {
    const { faqId } = req.params;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.bookmarks) {
      user.bookmarks = [];
    }

    const index = user.bookmarks.indexOf(faqId);
    if (index > -1) {
      user.bookmarks.splice(index, 1);
    } else {
      user.bookmarks.push(faqId);
    }

    await user.save();
    res.json({ message: 'Bookmarks updated successfully', bookmarks: user.bookmarks });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update bookmarks' });
  }
};

// Get populated bookmarks for user
exports.getBookmarks = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'bookmarks',
      match: { status: 'resolved' }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.bookmarks || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bookmarks' });
  }
};

// Get resolve FAQs upvoted/liked by the user
exports.getLikedFAQs = async (req, res) => {
  try {
    const faqs = await FAQ.find({
      upvoters: req.user._id,
      status: 'resolved',
      deletedAt: null
    }).select('title finalAnswer tags upvotes').lean();
    res.json(faqs || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch liked FAQs' });
  }
};

// Volunteer as responder
exports.becomeVolunteer = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.isVolunteer = true;
    await user.save();

    res.json({ message: 'You are now a volunteer responder!', user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to volunteer' });
  }
};