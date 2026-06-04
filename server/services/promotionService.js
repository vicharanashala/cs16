const Query = require('../models/Query');
const Answer = require('../models/Answer');
const Notification = require('../models/Notification');

exports.checkFAQPromotion = async (queryId) => {
  try {
    const query = await Query.findById(queryId);
    if (!query || query.status !== 'closed' || query.resolvedFAQ) return;

    // Check if it already has a pending FAQRequest
    const FAQRequest = require('../models/FAQRequest');
    const existingRequest = await FAQRequest.exists({ queryId: query._id });
    if (existingRequest) return;

    // Find accepted answer
    const acceptedAns = await Answer.findOne({ queryId: query._id, isAccepted: true, deletedAt: null });
    if (!acceptedAns) return;

    // Define attention/hit thresholds
    // Prompts when: communityScore >= 15 OR facingCount >= 3 OR searchHits >= 5
    const thresholdMet = 
      (query.communityScore >= 15) || 
      (query.facingCount >= 3) || 
      (query.searchHits >= 5);

    if (!thresholdMet) return;

    // Check if we already sent a promotion notification to the author
    const existingPromoNotification = await Notification.exists({
      recipient: query.createdBy,
      type: 'faq_promotion',
      link: `/community?highlight=${query._id}`
    });
    if (existingPromoNotification) return;

    // Create notifications for original author
    await Notification.create({
      recipient: query.createdBy,
      type: 'faq_promotion',
      title: 'Collaborative FAQ Promotion Request',
      message: `Your resolved query "${query.title}" has gained significant community interest. Collaborate to promote it into a Wiki FAQ for reputation rewards!`,
      link: `/community?highlight=${query._id}`
    });

    // Create notifications for responder (accepted answer author)
    if (acceptedAns.userId.toString() !== query.createdBy.toString()) {
      await Notification.create({
        recipient: acceptedAns.userId,
        type: 'faq_promotion',
        title: 'Collaborative FAQ Promotion Request',
        message: `The query "${query.title}" you answered has gained high community interest. Collaborate with the author to formalize it into a Wiki FAQ for reputation rewards!`,
        link: `/community?highlight=${query._id}`
      });
    }

    console.log(`[Promotion Service] Triggered collaborative FAQ promotion prompt for Query: "${query.title}"`);
  } catch (err) {
    console.error('FAQ promotion check error:', err);
  }
};
