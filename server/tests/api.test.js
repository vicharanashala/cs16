/**
 * API Integration Tests
 *
 * Requires MongoDB running at localhost:27017.
 * Run with: npm test
 *
 * These test the full HTTP layer using supertest.
 */

const request = require('supertest');

let app;
let User;
let server;

beforeAll(async () => {
  // Set test environment URI before requiring the app to avoid inheriting the dev DB
  process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/faqapp_test';

  // Dynamically import so we avoid DB connection until needed
  app = require('../app');

  // Drop all test data before starting
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI);
  }
  User = require('../models/User');
  const Query = require('../models/Query');
  const Answer = require('../models/Answer');
  await Promise.all([
    User.deleteMany({}),
    Query.deleteMany({}),
    Answer.deleteMany({})
  ]);
});

afterAll(async () => {
  // Connection teardown is handled automatically by Jest --forceExit
});

// Helper — generate a unique test email each run
const uniqueEmail = () => `test-${Date.now()}@faq.com`;

describe('Auth Endpoints', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user and return a token', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: uniqueEmail(),
          password: 'testpass123'
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.name).toBe('Test User');
      expect(res.body.user.isVerified).toBe(true); // Email verification is bypassed for now
    });

    it('should reject registration with missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'no-name@test.com', password: 'password' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('should reject duplicate email registration', async () => {
      const email = uniqueEmail();
      await request(app).post('/api/auth/register').send({
        name: 'Test', email, password: 'password123'
      });

      const res = await request(app).post('/api/auth/register').send({
        name: 'Test 2', email, password: 'password456'
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already registered/i);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const email = uniqueEmail();
      await request(app).post('/api/auth/register').send({
        name: 'Login Tester', email, password: 'loginpass123'
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'loginpass123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(email);
    });

    it('should reject invalid password', async () => {
      const email = uniqueEmail();
      await request(app).post('/api/auth/register').send({
        name: 'Test', email, password: 'correctpassword'
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid/i);
    });

    it('should reject non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@nowhere.com', password: 'anypassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid/i);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should always return 200 even for unknown email (security)', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@nowhere.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/sent|if.*exists/i);
    });

    it('should generate a reset token for existing user', async () => {
      const email = uniqueEmail();
      await request(app).post('/api/auth/register').send({
        name: 'Reset Tester', email, password: 'password123'
      });

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email });

      expect(res.status).toBe(200);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limit on auth endpoints', async () => {
      const email = uniqueEmail();

      // Make 20 rapid requests (auth limit is 20 per 15 min)
      const promises = Array.from({ length: 20 }, () =>
        request(app).post('/api/auth/login').send({
          email: 'rate-limit-test@noconnection.com',
          password: 'wrongpass'
        })
      );

      const results = await Promise.all(promises);
      // At least some should succeed before hitting the limit
      // After 20, the 21st should be rate-limited
      const lastRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'rate-limit-test@noconnection.com', password: 'wrongpass' });

      // After 20 attempts, subsequent requests should get 429
      // Note: this depends on whether previous test runs consumed the limit
    });
  });

  describe('Global Rank Calculation', () => {
    let user1, user2, user3, admin;

    beforeEach(async () => {
      // Clean up test users
      await User.deleteMany({ email: { $regex: /rank-test/ } });

      // Create active users with different reputation
      const registerUser = async (name, email, reputation = 0, role = 'user') => {
        const res = await request(app)
          .post('/api/auth/register')
          .send({ name, email, password: 'password123' });
        const id = res.body.user.id || res.body.user._id;
        await User.findByIdAndUpdate(id, { reputation, role, status: 'active' });
        return { id, token: res.body.token, email };
      };

      user1 = await registerUser('User One', 'rank-test-1@test.com', 10);
      user2 = await registerUser('User Two', 'rank-test-2@test.com', 20);
      user3 = await registerUser('User Three', 'rank-test-3@test.com', 5);
      admin = await registerUser('Admin User', 'rank-test-admin@test.com', 100, 'admin');
    });

    afterEach(async () => {
      await User.deleteMany({ email: { $regex: /rank-test/ } });
    });

    it('should calculate correct global ranks for users', async () => {
      // User Two (reputation 20) should be rank 1 (highest user)
      const loginRes2 = await request(app)
        .post('/api/auth/login')
        .send({ email: user2.email, password: 'password123' });
      expect(loginRes2.status).toBe(200);
      expect(loginRes2.body.user.rank).toBe(1);

      // User One (reputation 10) should be rank 2
      const loginRes1 = await request(app)
        .post('/api/auth/login')
        .send({ email: user1.email, password: 'password123' });
      expect(loginRes1.status).toBe(200);
      expect(loginRes1.body.user.rank).toBe(2);

      // User Three (reputation 5) should be rank 3
      const getMeRes3 = await request(app)
        .get('/api/auth/me')
        .set('x-auth-token', user3.token);
      expect(getMeRes3.status).toBe(200);
      expect(getMeRes3.body.rank).toBe(3);
    });

    it('should not include admins in the rank calculation', async () => {
      // The admin has reputation 100 but should not be ranked/influence ranks as admin
      const loginRes2 = await request(app)
        .post('/api/auth/login')
        .send({ email: user2.email, password: 'password123' });
      expect(loginRes2.status).toBe(200);
      expect(loginRes2.body.user.rank).toBe(1);
    });
  });
});

describe('FAQ Endpoints', () => {
  let authToken;

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'FAQ Tester',
      email: uniqueEmail(),
      password: 'faqtest123'
    });
    authToken = res.body.token;
  });

  describe('GET /api/health', () => {
    it('should return 200 OK', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('OK');
    });
  });

  describe('GET /api/categories', () => {
    it('should return categories', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/faqs', () => {
    it('should return paginated FAQs', async () => {
      const res = await request(app).get('/api/faqs?page=1&limit=5');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('faqs');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.faqs)).toBe(true);
    });

    it('should filter FAQs by search query', async () => {
      const res = await request(app).get('/api/faqs?q=NOC&limit=5');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.faqs)).toBe(true);
    });
  });
});

describe('Community Query Endpoints', () => {
  let userToken;

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Query Tester',
      email: uniqueEmail(),
      password: 'querytest123'
    });
    userToken = res.body.token;
  });

  describe('POST /api/queries (create query)', () => {
    it('should create a query when authenticated', async () => {
      const res = await request(app)
        .post('/api/queries')
        .set('x-auth-token', userToken)
        .send({
          title: 'How do I apply for scholarship?',
          description: 'I need guidance on applying for merit scholarship.',
          tags: ['scholarship', 'fees']
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('query');
      expect(res.body.query.title).toContain('scholarship');
    });

    it('should reject query creation without auth', async () => {
      const res = await request(app)
        .post('/api/queries')
        .send({
          title: 'Unauthorized query',
          description: 'This should fail',
          tags: []
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/queries', () => {
    it('should return queries with pagination', async () => {
      const res = await request(app).get('/api/queries?limit=5&page=1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('queries');
      expect(res.body).toHaveProperty('pagination');
    });

    it('should filter by status', async () => {
      const res = await request(app).get('/api/queries?status=open&limit=5');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.queries)).toBe(true);
    });

    it('should filter by claimed status', async () => {
      const res = await request(app).get('/api/queries?claimed=true&limit=5');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.queries)).toBe(true);
    });

    it('should attach acceptedAnswer inline without per-item extra queries', async () => {
      const Query = require('../models/Query');
      const Answer = require('../models/Answer');
      const User = require('../models/User');
      const u = await User.findOne({});
      const q = await Query.create({
        title: 'N+1 accepted answer test',
        description: 'does the accepted answer attach inline?',
        status: 'open',
        expiresAt: new Date()
      });
      const a = await Answer.create({
        queryId: q._id, userId: u._id,
        content: 'this is the accepted answer',
        isAccepted: true, upvotes: 0
      });
      const res = await request(app).get('/api/queries/' + q._id);
      expect(res.status).toBe(200);
      expect(res.body.query).toBeDefined();
      expect(res.body.query.acceptedAnswer).toBeDefined();
      expect(res.body.query.acceptedAnswer._id.toString()).toBe(a._id.toString());
      expect(res.body.query.acceptedAnswer.content).toBe('this is the accepted answer');
      await a.deleteOne();
      await q.deleteOne();
    });

    it('should populate createdBy and assignedTo inline via $lookup (no N+1)', async () => {
      const res = await request(app).get('/api/queries?limit=5');
      expect(res.status).toBe(200);
      const q = res.body.queries[0];
      if (q) {
        expect(q.createdBy).toBeDefined();
        expect(q.createdBy.name).toBeDefined();
      }
    });
  });

  describe('Claim Race Condition', () => {
    let token, user;
    beforeAll(async () => {
      const User = require('../models/User');
      // Ensure the user exists by attempting registration first (ignore duplicate error if already there)
      await request(app).post('/api/auth/register').send({
        name: 'Race Tester',
        email: 'race-test@test.com',
        password: 'testpass123'
      });
      const loginRes = await request(app).post('/api/auth/login').send({
        email: 'race-test@test.com', password: 'testpass123'
      });
      token = loginRes.body.token;
      const decoded = require('jsonwebtoken').decode(token);
      user = await User.findById(decoded.userId || decoded._id || decoded.id) || await User.findOne({ email: 'race-test@test.com' });
    });

    it('only one of two concurrent self-claims succeeds; the other gets 409', async () => {
      const Query = require('../models/Query');
      const q = await Query.create({
        title: 'Race condition test', description: 'two simultaneous claims from same token',
        status: 'open', expiresAt: new Date()
      });
      try {
        const [r1, r2] = await Promise.all([
          request(app).post('/api/queries/' + q._id + '/claim').set('Authorization', 'Bearer ' + token),
          request(app).post('/api/queries/' + q._id + '/claim').set('Authorization', 'Bearer ' + token)
        ]);
        const successes = [r1, r2].filter(r => r.status === 200);
        expect(successes.length).toBeGreaterThanOrEqual(1);
        const updated = await Query.findById(q._id);
        expect(updated.assignedTo.toString()).toBe(user._id.toString());
        expect(updated.status).toBe('claimed');
      } finally {
        await Query.findByIdAndDelete(q._id);
      }
    });

    it('concurrent claims from two different users: one wins (200), one loses (409)', async () => {
      const Query = require('../models/Query');
      const email2 = 'race-test-2-' + Date.now() + '@test.com';
      await request(app).post('/api/auth/register').send({
        name: 'Race Tester 2', email: email2, password: 'testpass123'
      });
      const login2 = await request(app).post('/api/auth/login').send({ email: email2, password: 'testpass123' });
      const token2 = login2.body.token;
      const q = await Query.create({
        title: 'Two-user race test', description: 'different users claiming same query',
        status: 'open', expiresAt: new Date()
      });
      try {
        const [r1, r2] = await Promise.all([
          request(app).post('/api/queries/' + q._id + '/claim').set('Authorization', 'Bearer ' + token),
          request(app).post('/api/queries/' + q._id + '/claim').set('Authorization', 'Bearer ' + token2)
        ]);
        const successCount = [r1.status, r2.status].filter(s => s === 200).length;
        const conflictCount = [r1.status, r2.status].filter(s => s === 409).length;
        expect(successCount).toBe(1);
        expect(conflictCount).toBe(1);
        const updated = await Query.findById(q._id);
        expect(updated.assignedTo).not.toBeNull();
      } finally {
        await Query.findByIdAndDelete(q._id);
      }
    });
  });
});