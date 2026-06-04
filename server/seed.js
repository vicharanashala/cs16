require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const FAQ = require('./models/FAQ');
const Pin = require('./models/Pin');
const Query = require('./models/Query');
const Answer = require('./models/Answer');
const parseFAQtxt = require('./parseFaqTxt');

async function seed(force = false) {
  try {
    // Only connect if not already connected (e.g. when called from server.js)
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/Grantha');
      console.log('Connected to MongoDB');
    }

    // Guard: require RESET_DB=true to proceed with destructive seed
    if (process.env.RESET_DB !== 'true' && !force) {
      let admin = await User.findOne({ email: 'admin@faqapp.com' });
      if (!admin) {
        admin = await User.create({
          name: 'Admin',
          email: 'admin@faqapp.com',
          password: 'admin123',
          role: 'admin',
          reputation: 1000,
          isVerified: true
        });
        console.log('Created admin user: admin@faqapp.com / admin123');
      } else {
        console.log('Admin user already exists, skipping seed (RESET_DB=true not set)');
      }
      console.log('\nTo reset and reseed the database, run: RESET_DB=true npm run seed');
      if (require.main === module) {
        await mongoose.disconnect();
        process.exit(0);
      }
      return;
    }

    console.log('RESET_DB=true — clearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      FAQ.deleteMany({}),
      Pin.deleteMany({}),
      Query.deleteMany({}),
      Answer.deleteMany({})
    ]);
    console.log('Cleared existing data');

    // Create synthetic users
    console.log('Creating synthetic user profiles...');
    const admin = await User.create({
      name: 'Admin',
      email: 'admin@faqapp.com',
      password: 'admin123',
      role: 'admin',
      reputation: 1000,
      isVerified: true
    });

    const siddharth = await User.create({
      name: 'Siddharth Acharya',
      email: 'siddharth@example.com',
      password: 'password123',
      role: 'user',
      reputation: 750,
      isVerified: true,
      answersGiven: 14
    });

    const pooja = await User.create({
      name: 'Pooja Iyer',
      email: 'pooja@example.com',
      password: 'password123',
      role: 'user',
      reputation: 500,
      isVerified: true,
      answersGiven: 9
    });

    const vikram = await User.create({
      name: 'Vikram Rao',
      email: 'vikram@example.com',
      password: 'password123',
      role: 'user',
      reputation: 350,
      isVerified: true,
      answersGiven: 5
    });

    const ananya = await User.create({
      name: 'Ananya Sen',
      email: 'ananya@example.com',
      password: 'password123',
      role: 'user',
      reputation: 80,
      isVerified: true,
      answersGiven: 2
    });

    const rohan = await User.create({
      name: 'Rohan Mehta',
      email: 'rohan@example.com',
      password: 'password123',
      role: 'user',
      reputation: 25,
      isVerified: true,
      questionsAsked: 3
    });

    const amit = await User.create({
      name: 'Amit Patel',
      email: 'amit@example.com',
      password: 'password123',
      role: 'user',
      reputation: 400,
      isVerified: true,
      answersGiven: 8
    });

    const neha = await User.create({
      name: 'Neha Sharma',
      email: 'neha@example.com',
      password: 'password123',
      role: 'user',
      reputation: 300,
      isVerified: true,
      answersGiven: 6
    });

    const priya = await User.create({
      name: 'Priya Nair',
      email: 'priya@example.com',
      password: 'password123',
      role: 'user',
      reputation: 200,
      isVerified: true,
      answersGiven: 4
    });

    console.log('Synthetic users created successfully.');

    // Parse FAQs from FAQ.txt
    const { sections, faqs } = parseFAQtxt();
    console.log(`Parsed ${faqs.length} FAQs from FAQ.txt across ${sections.length} sections`);

    // Insert FAQs with trending viewCounts and lastViewed timestamps to test "This Week"
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    const faqDocs = faqs.map((faq, index) => {
      // Pick some FAQs to be "popular in last 7 days"
      let lastViewed = null;
      let viewCount = Math.floor(Math.random() * 15); // standard low views
      
      // We make first few FAQs in primary categories highly trending
      const primaryTags = ['vibe-course', 'internship-rules', 'submission-guidelines'];
      const hasPrimaryTag = faq.tags.some(t => primaryTags.includes(t));

      if (hasPrimaryTag || index % 5 === 0) {
        viewCount = Math.floor(Math.random() * 100) + 50; // 50 to 150 views
        // Assign random last viewed timestamp within the last 5 days
        const days = [oneDayAgo, threeDaysAgo, fiveDaysAgo];
        lastViewed = days[index % days.length];
      }

      return {
        title: faq.title,
        description: faq.description,
        finalAnswer: faq.finalAnswer,
        tags: faq.tags,
        status: 'resolved',
        createdBy: admin._id,
        isValidated: true,
        viewCount,
        lastViewed,
        upvotes: Math.floor(Math.random() * 20)
      };
    });

    const inserted = await FAQ.insertMany(faqDocs);
    console.log(`Inserted ${inserted.length} FAQs into database`);

    // Insert default community board pins
    const announcementPin = await Pin.create({
      type: 'announcement',
      title: 'Grantha 2026 Summership is Live!',
      content: 'Welcome all interns! Please make sure to check ViBe LMS daily for course announcements and progress score updates.',
      pinnedBy: admin._id,
      order: 0
    });

    const overviewPin = await Pin.create({
      type: 'overview',
      title: 'Overview',
      content: 'Grantha is your student-driven community knowledge base. Search existing resolved FAQs first before raising new queries. Help peers by answering open queries in the forum!',
      pinnedBy: admin._id,
      order: 1
    });

    if (inserted.length > 0) {
      await Pin.create({
        type: 'faq',
        title: `Pinned FAQ: ${inserted[0].title}`,
        faqId: inserted[0]._id,
        pinnedBy: admin._id,
        order: 2
      });
    }
    console.log('Created default community board pins');

    // ── Seed active forum queries and responses ────────────────────────────
    console.log('Seeding community queries and responses...');

    // Query 1: Open Troubleshooting Query
    const query1 = await Query.create({
      title: 'How to fix the 100% progress issue in ViBe LMS?',
      description: 'I have completed all video modules and quizzes in the ViBe course, but my profile dashboard still shows 98% progress. Is there a specific lesson that needs manual marking?',
      tags: ['vibe-course', 'troubleshooting'],
      createdBy: rohan._id,
      status: 'open',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    // Query 2: Claimed Query
    const query2 = await Query.create({
      title: 'Is there a template we need to follow for the daily logs?',
      description: 'Can someone share the Markdown structure we need to use when writing our daily logs in our internship notebook? Do we include timestamps or just bullet points?',
      tags: ['internship-rules', 'logs'],
      createdBy: rohan._id,
      assignedTo: vikram._id,
      claimedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      status: 'claimed',
      expiresAt: new Date(Date.now() + 22 * 60 * 60 * 1000)
    });

    // Query 3: Closed Query with Accepted Answer
    const query3 = await Query.create({
      title: 'Where do we find the Git repo link for the final project submission?',
      description: 'Is the repository link shared on Slack, or is it on the ViBe LMS page? I need to fork it for my final project.',
      tags: ['submission-guidelines', 'git'],
      createdBy: ananya._id,
      status: 'closed',
      answeredAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      resolvedFAQ: inserted[0]._id,
      answerCount: 1
    });

    const answer3 = await Answer.create({
      content: "The final project repository is hosted on the organization's GitHub under `grantha/cs16`. You don't need to fork it directly; instead, create a private repository following the instructions in the project description and add the reviewers as collaborators.",
      queryId: query3._id,
      userId: pooja._id,
      upvotes: 12,
      upvotedBy: [ananya._id, rohan._id, vikram._id],
      isAccepted: true,
      acceptedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      isVetted: true,
      acceptedRepAwarded: 20
    });

    // Query 4: Open Query with competing answers
    const query4 = await Query.create({
      title: 'What happens if we miss the daily sync meeting due to college exams?',
      description: 'I have my final semester exam next Tuesday at 10 AM, which directly clashes with the daily sync. Who should I notify beforehand, and is there an alternative check-in?',
      tags: ['internship-rules', 'sync'],
      createdBy: ananya._id,
      status: 'open',
      expiresAt: new Date(Date.now() + 18 * 60 * 60 * 1000),
      answerCount: 2
    });

    const answer4a = await Answer.create({
      content: "You must fill out the Absence Form in the Notion workspace at least 48 hours in advance and message your team lead on Slack. You will also need to review the recorded sync meeting later and update your daily log with a note explaining your absence.",
      queryId: query4._id,
      userId: siddharth._id,
      upvotes: 8,
      upvotedBy: [rohan._id, pooja._id],
      isAccepted: false,
      isVetted: true
    });

    const answer4b = await Answer.create({
      content: "Just tell your lead, they are usually very understanding about college exams!",
      queryId: query4._id,
      userId: vikram._id,
      upvotes: 2,
      upvotedBy: [rohan._id],
      isAccepted: false,
      isVetted: false
    });

    // Query 5: About the Internship
    const query5 = await Query.create({
      title: 'What is the structure of the weekly check-ins for the internship?',
      description: 'Can someone explain how the weekly check-ins are structured? Is it individual or team-based?',
      tags: ['about-the-internship'],
      createdBy: rohan._id,
      status: 'closed',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      answerCount: 3
    });

    await Answer.create({
      content: 'Weekly check-ins are structured as group syncs on Fridays. You will present your team progress and showcase any completed modules.',
      queryId: query5._id,
      userId: siddharth._id,
      upvotes: 15,
      isAccepted: true,
      acceptedAt: new Date(),
      isVetted: true
    });

    await Answer.create({
      content: 'Yes, it is mostly team-based. We present in our Slack channels and review slide decks.',
      queryId: query5._id,
      userId: amit._id,
      upvotes: 8,
      isAccepted: false,
      isVetted: true
    });

    await Answer.create({
      content: 'I think it is individual.',
      queryId: query5._id,
      userId: rohan._id,
      upvotes: 2,
      isAccepted: false,
      isVetted: false
    });

    // Query 6: Selection Offer Letter
    const query6 = await Query.create({
      title: 'Can we change the start date on our internship offer letter?',
      description: 'I need to adjust the start date on my offer letter to align with my university holiday schedule. Who do I contact?',
      tags: ['selection-offer-letter-and-cer'],
      createdBy: rohan._id,
      status: 'closed',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      answerCount: 3
    });

    await Answer.create({
      content: 'You should email HR at admissions@faqapp.com with your offer letter and your requested revised dates.',
      queryId: query6._id,
      userId: pooja._id,
      upvotes: 12,
      isAccepted: true,
      acceptedAt: new Date(),
      isVetted: true
    });

    await Answer.create({
      content: 'Send a Slack message to the HR channel with your registration number and requested schedule.',
      queryId: query6._id,
      userId: neha._id,
      upvotes: 7,
      isAccepted: false,
      isVetted: true
    });

    await Answer.create({
      content: 'I had my date shifted by calling the support team directly.',
      queryId: query6._id,
      userId: ananya._id,
      upvotes: 3,
      isAccepted: false,
      isVetted: true
    });

    // Query 7: NOC Certificate
    const query6b = await Query.create({
      title: 'How long does it take to process an NOC request?',
      description: 'I submitted my NOC application form on Monday. When can I expect the signed PDF?',
      tags: ['noc-no-objection-certificate'],
      createdBy: rohan._id,
      status: 'closed',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      answerCount: 3
    });

    await Answer.create({
      content: 'NOC requests generally take 3-5 business days. Once signed by the registrar, it will be emailed directly to you.',
      queryId: query6b._id,
      userId: vikram._id,
      upvotes: 14,
      isAccepted: true,
      acceptedAt: new Date(),
      isVetted: true
    });

    await Answer.create({
      content: 'Yes, mine took exactly 4 days. Make sure your college details are correct.',
      queryId: query6b._id,
      userId: amit._id,
      upvotes: 9,
      isAccepted: false,
      isVetted: true
    });

    await Answer.create({
      content: 'You can check your status in the Student Services portal.',
      queryId: query6b._id,
      userId: siddharth._id,
      upvotes: 4,
      isAccepted: false,
      isVetted: true
    });

    // Query 8: Timing and Dates
    const query7 = await Query.create({
      title: 'What are the daily check-in and check-out timings?',
      description: 'Is there a strict login/logout window we need to adhere to during our remote working shifts?',
      tags: ['timing-and-dates'],
      createdBy: ananya._id,
      status: 'closed',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      answerCount: 3
    });

    await Answer.create({
      content: 'The core hours are 10 AM to 5 PM. You need to log your daily standup by 10:15 AM and checkout standdown by 5:00 PM.',
      queryId: query7._id,
      userId: siddharth._id,
      upvotes: 16,
      isAccepted: true,
      acceptedAt: new Date(),
      isVetted: true
    });

    await Answer.create({
      content: 'Login by 10 AM, and checkout anytime after 5 PM is acceptable as long as core tasks are submitted.',
      queryId: query7._id,
      userId: neha._id,
      upvotes: 8,
      isAccepted: false,
      isVetted: true
    });

    await Answer.create({
      content: 'You can also request flexible hours if approved by your team lead.',
      queryId: query7._id,
      userId: vikram._id,
      upvotes: 2,
      isAccepted: false,
      isVetted: true
    });

    // Query 9: Work Mentorship and Projects
    const query8 = await Query.create({
      title: 'Who is our assigned mentor for the Phase 2 React project?',
      description: 'We are starting our Phase 2 web application development. Has our group mentor been announced yet?',
      tags: ['work-mentorship-and-projects'],
      createdBy: ananya._id,
      status: 'closed',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      answerCount: 3
    });

    await Answer.create({
      content: 'Phase 2 mentors are listed on the Project Sheet pinned in your team Slack channel. Each team of 5 has a designated senior engineer.',
      queryId: query8._id,
      userId: vikram._id,
      upvotes: 11,
      isAccepted: true,
      acceptedAt: new Date(),
      isVetted: true
    });

    await Answer.create({
      content: 'Yes, check the Excel sheet on Google Drive. Our team is assigned to Amit Patel.',
      queryId: query8._id,
      userId: priya._id,
      upvotes: 10,
      isAccepted: false,
      isVetted: true
    });

    await Answer.create({
      content: 'Check with your coordinator if your group is not listed.',
      queryId: query8._id,
      userId: pooja._id,
      upvotes: 3,
      isAccepted: false,
      isVetted: true
    });

    // Query 10: Certificate
    const query9 = await Query.create({
      title: 'How do we obtain the signed physical copy of the internship certificate?',
      description: 'Will the physical certificates be posted to our home addresses, or is it digital only?',
      tags: ['certificate'],
      createdBy: ananya._id,
      status: 'closed',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      answerCount: 3
    });

    await Answer.create({
      content: 'Digital certificates are issued via email. You can request a physical signed copy by paying a small courier fee in the portal.',
      queryId: query9._id,
      userId: pooja._id,
      upvotes: 15,
      isAccepted: true,
      acceptedAt: new Date(),
      isVetted: true
    });

    await Answer.create({
      content: 'You can collect it in-person from the university office on graduation day, or request shipping.',
      queryId: query9._id,
      userId: priya._id,
      upvotes: 9,
      isAccepted: false,
      isVetted: true
    });

    await Answer.create({
      content: ' डिजिटल कॉपी ही मिलेगी, फिजिकल के लिए आवेदन करें।',
      queryId: query9._id,
      userId: neha._id,
      upvotes: 4,
      isAccepted: false,
      isVetted: true
    });

    console.log('Seeded community Q&A successfully!');

    // Summary by section
    console.log('\n=== FAQ Count by Section ===');
    sections.forEach(s => {
      const count = faqs.filter(f => f.sectionNumber === s.number).length;
      console.log(`  ${s.number}. ${s.title}: ${count} FAQs`);
    });

    console.log('\n✅ Seed completed successfully!');
    console.log(`\nTotal: ${inserted.length} FAQs`);
    if (require.main === module) {
      process.exit(0);
    }
  } catch (error) {
    console.error('Seed error:', error);
    if (require.main === module) {
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) {
  seed();
} else {
  module.exports = { seedDatabase: seed };
}