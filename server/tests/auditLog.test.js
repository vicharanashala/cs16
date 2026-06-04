const request = require('supertest');
const mongoose = require('mongoose');

let app;
let User;
let FAQ;
let Query;
let Pin;
let AuditLog;

beforeAll(async () => {
  process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/faqapp_test';
  app = require('../app');
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI);
  }
  User = require('../models/User');
  FAQ = require('../models/FAQ');
  Query = require('../models/Query');
  Pin = require('../models/Pin');
  AuditLog = require('../models/AuditLog');

  // Clean relevant collections
  await Promise.all([
    User.deleteMany({ email: { $regex: /auditlogtest/ } }),
    FAQ.deleteMany({ title: { $regex: /AuditLogTest/ } }),
    Query.deleteMany({ title: { $regex: /AuditLogTest/ } }),
    Pin.deleteMany({ title: { $regex: /AuditLogTest/ } }),
    AuditLog.deleteMany({})
  ]);
});

const uniqueEmail = (prefix) => `auditlogtest-${prefix}-${Date.now()}@test.com`;

const createUser = async (name, email, role = 'user') => {
  const registerRes = await request(app)
    .post('/api/auth/register')
    .send({
      name,
      email,
      password: 'password123'
    });
  
  const token = registerRes.body.token;
  const userId = registerRes.body.user.id || registerRes.body.user._id;

  if (role !== 'user') {
    await User.findByIdAndUpdate(userId, { role });
  }

  return { token, userId };
};

describe('Admin Moderation Audit Trail Panel Tests', () => {
  let adminUser;
  let testFaq;
  let testQuery;

  beforeAll(async () => {
    adminUser = await createUser('Admin User', uniqueEmail('admin'), 'admin');

    // Create a seed FAQ
    testFaq = await FAQ.create({
      title: 'AuditLogTest: How to apply for leave?',
      description: 'Applying for leave steps.',
      finalAnswer: 'Go to portal.',
      status: 'resolved',
      createdBy: adminUser.userId
    });

    // Create a seed Query
    testQuery = await Query.create({
      title: 'AuditLogTest: Open query about housing?',
      description: 'Is there student housing?',
      createdBy: adminUser.userId,
      status: 'open',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
  });

  afterEach(async () => {
    // Clear audit logs after each run to have clean assertion counts
    await AuditLog.deleteMany({});
  });

  describe('FAQ Soft-Delete & Restore Logging', () => {
    it('should log "soft-deleted" when an admin soft-deletes an FAQ', async () => {
      const res = await request(app)
        .patch(`/api/admin/faqs/${testFaq._id}`)
        .set('x-auth-token', adminUser.token)
        .send({ deletedAt: new Date() });

      expect(res.status).toBe(200);

      const log = await AuditLog.findOne({ targetModel: 'FAQ', targetId: testFaq._id });
      expect(log).toBeDefined();
      expect(log.action).toBe('soft-deleted');
      expect(log.performedBy.toString()).toBe(adminUser.userId);
      expect(log.targetName).toBe(testFaq.title);
    });

    it('should log "restored" when an admin restores a soft-deleted FAQ', async () => {
      // First ensure it is marked deleted
      await FAQ.findByIdAndUpdate(testFaq._id, { deletedAt: new Date() });

      const res = await request(app)
        .patch(`/api/admin/faqs/${testFaq._id}`)
        .set('x-auth-token', adminUser.token)
        .send({ deletedAt: null });

      expect(res.status).toBe(200);

      const log = await AuditLog.findOne({ targetModel: 'FAQ', targetId: testFaq._id });
      expect(log).toBeDefined();
      expect(log.action).toBe('restored');
      expect(log.targetName).toBe(testFaq.title);
    });
  });

  describe('Query Deletion & SLA Breach Logging', () => {
    it('should log "soft-deleted" when an admin soft-deletes a normal query', async () => {
      // Set future SLA
      await Query.findByIdAndUpdate(testQuery._id, {
        deletedAt: null,
        status: 'open',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });

      const res = await request(app)
        .patch(`/api/admin/queries/${testQuery._id}`)
        .set('x-auth-token', adminUser.token);

      expect(res.status).toBe(200);

      const log = await AuditLog.findOne({ targetModel: 'Query', targetId: testQuery._id });
      expect(log).toBeDefined();
      expect(log.action).toBe('soft-deleted');
    });

    it('should log "resolved SLA breach" when an admin soft-deletes an SLA-breached query', async () => {
      // Set expired SLA in the past
      await Query.findByIdAndUpdate(testQuery._id, {
        deletedAt: null,
        status: 'open',
        expiresAt: new Date(Date.now() - 5 * 60 * 1000)
      });

      const res = await request(app)
        .patch(`/api/admin/queries/${testQuery._id}`)
        .set('x-auth-token', adminUser.token);

      expect(res.status).toBe(200);

      const log = await AuditLog.findOne({ targetModel: 'Query', targetId: testQuery._id });
      expect(log).toBeDefined();
      expect(log.action).toBe('resolved SLA breach');
    });
  });

  describe('Pin CRUD Action Logging', () => {
    it('should log "created pin", "updated pin", and "deleted pin" during Pin operations', async () => {
      // 1. Create Pin
      const createRes = await request(app)
        .post('/api/admin/pins')
        .set('x-auth-token', adminUser.token)
        .send({
          type: 'announcement',
          title: 'AuditLogTest: Global Announcement',
          content: 'Announcement content',
          order: 1
        });
      
      expect(createRes.status).toBe(201);
      const createdPin = createRes.body;

      let log = await AuditLog.findOne({ targetModel: 'Pin', targetId: createdPin._id });
      expect(log).toBeDefined();
      expect(log.action).toBe('created pin');

      // 2. Update Pin
      await AuditLog.deleteMany({}); // clear logs
      const updateRes = await request(app)
        .patch(`/api/admin/pins/${createdPin._id}`)
        .set('x-auth-token', adminUser.token)
        .send({ title: 'AuditLogTest: Global Announcement Updated' });

      expect(updateRes.status).toBe(200);
      
      log = await AuditLog.findOne({ targetModel: 'Pin', targetId: createdPin._id });
      expect(log).toBeDefined();
      expect(log.action).toBe('updated pin');

      // 3. Delete Pin
      await AuditLog.deleteMany({}); // clear logs
      const deleteRes = await request(app)
        .delete(`/api/admin/pins/${createdPin._id}`)
        .set('x-auth-token', adminUser.token);

      expect(deleteRes.status).toBe(200);

      log = await AuditLog.findOne({ targetModel: 'Pin', targetId: createdPin._id });
      expect(log).toBeDefined();
      expect(log.action).toBe('deleted pin');
    });
  });

  describe('GET /api/admin/audit-logs retrieval', () => {
    it('should retrieve a sorted list of audit logs with performer info', async () => {
      // Create some logs
      await AuditLog.create({
        action: 'soft-deleted',
        performedBy: adminUser.userId,
        targetModel: 'FAQ',
        targetName: 'AuditLogTest FAQ Title'
      });

      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('x-auth-token', adminUser.token);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('performedBy');
      expect(res.body[0].performedBy.name).toBe('Admin User');
      expect(res.body[0].targetName).toBe('AuditLogTest FAQ Title');
    });
  });
});
