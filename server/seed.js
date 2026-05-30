require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const FAQ = require('./models/FAQ');
const Pin = require('./models/Pin');
const parseFAQtxt = require('./parseFaqTxt');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/FAQ App');
    console.log('Connected to MongoDB');

    // Guard: require RESET_DB=true to proceed with destructive seed
    // Without it, seed is effectively a no-op (safe for shared dev environments)
    if (process.env.RESET_DB !== 'true') {
      // Still ensure admin exists and is admin (upsert)
      let admin = await User.findOne({ email: 'admin@faqapp.com' });
      if (!admin) {
        admin = await User.create({
          name: 'Admin',
          email: 'admin@faqapp.com',
          password: 'admin123',
          role: 'admin',
          reputation: 100,
          isVerified: true
        });
        console.log('✅ Created admin user: admin@faqapp.com / admin123');
      } else {
        console.log('✅ Admin user already exists');
      }
      console.log('\nℹ️  To reset and reseed the database, run: RESET_DB=true npm run seed');
      await mongoose.disconnect();
      process.exit(0);
    }

    // ── Destructive seed begins ──────────────────────────────────────────────
    console.log('⚠️  RESET_DB=true — clearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      FAQ.deleteMany({}),
      Pin.deleteMany({})
    ]);
    console.log('✅ Cleared existing data');

    // Create a default admin user
    const admin = await User.create({
      name: 'Admin',
      email: 'admin@faqapp.com',
      password: 'admin123',
      role: 'admin',
      reputation: 100,
      isVerified: true
    });
    console.log('✅ Created admin user: admin@faqapp.com / admin123');

    // Parse FAQs from FAQ.txt with clear error handling
    let faqs = [];
    let sections = [];
    
    try {
      const parsed = parseFAQtxt();
      sections = parsed.sections;
      faqs = parsed.faqs;
      console.log(`✅ Parsed ${faqs.length} FAQs from FAQ.txt across ${sections.length} sections`);
    } catch (faqError) {
      console.warn('⚠️  FAQ.txt parsing failed:');
      console.warn(faqError.message);
      console.log('\n📌 Continuing without FAQs...');
      console.log('💡 Hint: You can still log in with admin@faqapp.com / admin123\n');
      sections = [];
      faqs = [];
    }

    // Insert FAQs (if any were parsed)
    if (faqs.length > 0) {
      const faqDocs = faqs.map(faq => ({
        title: faq.title,
        description: faq.description,
        finalAnswer: faq.finalAnswer,
        tags: faq.tags,
        status: 'resolved',
        createdBy: admin._id
      }));

      const inserted = await FAQ.insertMany(faqDocs);
      console.log(`✅ Inserted ${inserted.length} FAQs into database`);

      // Insert default community board pins
      const announcementPin = await Pin.create({
        type: 'announcement',
        title: 'Vicharanashala 2026 Summership is Live!',
        content: 'Welcome all interns! Please make sure to check ViBe LMS daily for course announcements and progress score updates.',
        pinnedBy: admin._id,
        order: 0
      });

      const overviewPin = await Pin.create({
        type: 'overview',
        title: 'About FAQ App FAQ Portal',
        content: 'FAQ App is your student-driven community knowledge base. Search existing resolved FAQs first before raising new queries. Help peers by answering open queries in the forum!',
        pinnedBy: admin._id,
        order: 1
      });

      // Pin the first FAQ
      if (inserted.length > 0) {
        await Pin.create({
          type: 'faq',
          title: `Pinned FAQ: ${inserted[0].title}`,
          faqId: inserted[0]._id,
          pinnedBy: admin._id,
          order: 2
        });
      }
      console.log('✅ Created default community board pins');

      // Summary by section
      console.log('\n=== FAQ Count by Section ===');
      sections.forEach(s => {
        const count = faqs.filter(f => f.sectionNumber === s.number).length;
        console.log(`  ${s.number}. ${s.title}: ${count} FAQs`);
      });

      console.log(`\n✅ Seed completed successfully! Total: ${inserted.length} FAQs`);
    } else {
      console.log('✅ Seed completed (admin user created, no FAQs loaded)');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seed error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

seed();