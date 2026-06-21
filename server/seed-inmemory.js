/**
 * Seed script using in-memory MongoDB for development
 * Uses mongodb-memory-server for local testing/development
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const parseFAQtxt = require('./parseFaqTxt');

let mongoServer;

async function seed() {
  try {
    // Start in-memory MongoDB
    console.log('Starting in-memory MongoDB...');
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    console.log('Connecting to in-memory database...');
    await mongoose.connect(mongoUri, {
      dbName: 'faqapp'
    });

    // Import models after connection
    const User = require('./models/User');
    const FAQ = require('./models/FAQ');
    const Pin = require('./models/Pin');

    // Clear collections
    console.log('Clearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      FAQ.deleteMany({}),
      Pin.deleteMany({})
    ]);

    // Create admin user
    console.log('Creating admin user...');
    const admin = new User({
      name: 'Admin',
      email: 'admin@faqapp.com',
      password: 'admin123',
      role: 'admin',
      isVerified: true
    });
    await admin.save();
    console.log('✓ Admin user created');

    // Parse and insert FAQs
    console.log('Parsing FAQ.txt...');
    const { sections, faqs } = parseFAQtxt();
    console.log(`Found ${faqs.length} FAQs in ${sections.length} sections`);

    const faqDocs = faqs.map(faq => ({
      title: faq.title,
      description: faq.description,
      finalAnswer: faq.finalAnswer,
      tags: faq.tags || [],
      status: 'resolved',
      createdBy: admin._id
    }));

    const insertedFAQs = await FAQ.insertMany(faqDocs);
    console.log(`✓ Inserted ${insertedFAQs.length} FAQs`);

    // Create default pins for community board
    console.log('Creating community board pins...');
    const pins = [
      {
        type: 'announcement',
        title: 'Grantha 2026 Summership is Live!',
        content: 'Welcome all interns! Please make sure to check ViBe LMS daily for course announcements and progress score updates.',
        pinnedBy: admin._id,
        order: 0
      },
      {
        type: 'announcement',
        title: 'Submit Your Daily Logs Before 6:00 PM',
        content: 'A quick reminder to all cohort interns: daily progress logs must be submitted in Markdown format before 6:00 PM every evening. Ensure you include your ticket IDs and task descriptions.',
        pinnedBy: admin._id,
        order: 1
      },
      {
        type: 'announcement',
        title: 'Scheduled Database Maintenance on Sunday',
        content: 'The Grantha platform will undergo scheduled database maintenance and RAG cache optimization this Sunday, June 21, between 2:00 AM and 4:00 AM IST. Expect temporary service interruptions during this window.',
        pinnedBy: admin._id,
        order: 2
      },
      {
        type: 'announcement',
        title: 'Weekly Reputation Leaderboard Updates',
        content: "Congratulations to the top contributors on this week's leaderboard! Vetting points and accepted answer scores have been synced. The weekly bonus reputation will be credited to top profiles by Friday midnight.",
        pinnedBy: admin._id,
        order: 3
      }
    ];

    await Pin.insertMany(pins);
    console.log('✓ Created community board pins');

    console.log('\n✅ Seeding completed successfully!');
    console.log(`   - Admin user: admin@faqapp.com / admin123`);
    console.log(`   - Total FAQs: ${insertedFAQs.length}`);
    console.log(`   - Database: In-memory MongoDB`);

    // Keep server running for a moment to verify data
    console.log('\nVerifying data...');
    const faqCount = await FAQ.countDocuments();
    const userCount = await User.countDocuments();
    console.log(`   - Users in DB: ${userCount}`);
    console.log(`   - FAQs in DB: ${faqCount}`);

  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  } finally {
    // Cleanup
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
    console.log('\nDatabase connection closed.');
    process.exit(0);
  }
}

seed();
