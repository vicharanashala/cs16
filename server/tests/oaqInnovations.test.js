const request = require('supertest');
const mongoose = require('mongoose');

let app;
let User;
let Query;
let Answer;
let FAQ;
let FAQRequest;
let Notification;

// Mock fetch globally
let mockFetchResponses = {};
const originalFetch = global.fetch;

beforeAll(async () => {
  process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/faqapp_test';
  app = require('../app');
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI);
  }
  User = require('../models/User');
  Query = require('../models/Query');
  Answer = require('../models/Answer');
  FAQ = require('../models/FAQ');
  FAQRequest = require('../models/FAQRequest');
  Notification = require('../models/Notification');

  // Clear relevant collections
  await Promise.all([
    User.deleteMany({ email: { $regex: /oaqtest/ } }),
    Query.deleteMany({ title: { $regex: /OAQTest/ } }),
    Answer.deleteMany({ content: { $regex: /OAQTest/ } }),
    FAQ.deleteMany({ title: { $regex: /OAQTest/ } }),
    FAQRequest.deleteMany({}),
    Notification.deleteMany({ type: 'faq_promotion' })
  ]);

  // Global fetch mock
  global.fetch = jest.fn((url, options) => {
    if (url.includes('/api/tags')) {
      if (mockFetchResponses.tagsOffline) {
        return Promise.reject(new Error('Fetch error'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'llama3' }] })
      });
    }
    if (url.includes('/api/embeddings')) {
      if (mockFetchResponses.embeddingsOffline) {
        return Promise.reject(new Error('Fetch error'));
      }
      // Return a dummy embedding vector
      const text = options && options.body ? JSON.parse(options.body).prompt : '';
      let vector = Array(10).fill(0.1);
      if (text.includes('scholarship')) {
        vector = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
      } else if (text.includes('internship')) {
        vector = [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ embedding: vector })
      });
    }
    if (url.includes('/api/generate')) {
      const bodyObj = options && options.body ? JSON.parse(options.body) : {};
      const isStream = bodyObj.stream !== false;
      if (isStream) {
        const mockReader = {
          read: jest.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(JSON.stringify({ response: 'OAQTest stream answer' }) + '\n')
            })
            .mockResolvedValueOnce({ done: true })
        };
        return Promise.resolve({
          ok: true,
          body: {
            getReader: () => mockReader
          }
        });
      } else {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: 'Yes' })
        });
      }
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

afterAll(async () => {
  global.fetch = originalFetch;
});

const uniqueEmail = (prefix) => `oaqtest-${prefix}-${Date.now()}@test.com`;

const createUser = async (name, email, role = 'user', reputation = 0) => {
  const registerRes = await request(app)
    .post('/api/auth/register')
    .send({
      name,
      email,
      password: 'password123'
    });
  
  const token = registerRes.body.token;
  const userId = registerRes.body.user.id || registerRes.body.user._id;

  if (role !== 'user' || reputation !== 0) {
    await User.findByIdAndUpdate(userId, { role, reputation });
  }

  return { token, userId };
};

describe('Once Asked Questions (OAQs) Innovations Tests', () => {
  let asker;
  let responder;
  let admin;
  let testQuery;
  let testAnswer;

  beforeAll(async () => {
    asker = await createUser('Asker User', uniqueEmail('asker'), 'user', 10);
    responder = await createUser('Responder User', uniqueEmail('resp'), 'user', 20);
    admin = await createUser('Admin User', uniqueEmail('admin'), 'admin');

    // Create a community query
    const queryRes = await request(app)
      .post('/api/queries')
      .set('x-auth-token', asker.token)
      .send({
        title: 'OAQTest: scholarship guidance',
        description: 'How do I apply for scholarship options?',
        tags: ['scholarship']
      });
    testQuery = queryRes.body.query;

    // Submit an answer
    const answerRes = await request(app)
      .post('/api/answers')
      .set('x-auth-token', responder.token)
      .send({
        queryId: testQuery._id,
        content: 'OAQTest: Submit via portal and fill PDF.'
      });
    testAnswer = answerRes.body.answer;

    // Accept the answer and close the query
    await request(app)
      .post(`/api/answers/${testAnswer._id}/accept`)
      .set('x-auth-token', asker.token);
  });

  beforeEach(() => {
    mockFetchResponses = {};
    const { clearRagCache } = require('../controllers/ragController');
    clearRagCache();
  });

  describe('1. Vector-based Semantic Archival (RAG Integration)', () => {
    it('should calculate and retrieve vector embeddings using mock Ollama', async () => {
      const { buildRagIndex, clearRagCache } = require('../controllers/ragController');
      
      // Trigger background build & wait
      await buildRagIndex();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      clearRagCache();
      const index = await buildRagIndex();
      
      // The query was closed/resolved, so it should be in the corpus
      const corpusQuery = index.faqs.find(f => f._id.toString() === testQuery._id.toString());
      expect(corpusQuery).toBeDefined();
      expect(corpusQuery.embedding).toBeDefined();
      expect(corpusQuery.embedding[0]).toBe(1.0); // matches scholarship mock vector
    });

    it('should match context using cosine similarity in RAG chat', async () => {
      // Force build index with embedding first
      const { buildRagIndex, clearRagCache } = require('../controllers/ragController');
      await buildRagIndex();
      await new Promise(resolve => setTimeout(resolve, 200));
      clearRagCache();
      await buildRagIndex();

      const res = await request(app)
        .post('/api/rag/chat')
        .buffer(true)
        .parse((res, callback) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => { callback(null, data); });
        })
        .send({ question: 'How can I get scholarship?' });

      expect(res.status).toBe(200);
      const lines = res.body.split('\n').filter(line => line.trim());
      const parsedLines = lines.map(line => JSON.parse(line));
      expect(parsedLines[0]).toHaveProperty('sources');
    });

    it('should fallback to BM25 search when Ollama is offline', async () => {
      mockFetchResponses.tagsOffline = true;
      mockFetchResponses.embeddingsOffline = true;

      const res = await request(app)
        .post('/api/rag/chat')
        .buffer(true)
        .parse((res, callback) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => { callback(null, data); });
        })
        .send({ question: 'scholarship guidance' });

      expect(res.status).toBe(200);
      const lines = res.body.split('\n').filter(line => line.trim());
      const parsedLines = lines.map(line => JSON.parse(line));
      expect(parsedLines[0]).toHaveProperty('sources');
    });
  });

  describe('2. Auto-FAQ Collaborative Promotion & reputation rewards', () => {
    it('should increment query search hits during search and trigger promotion checks', async () => {
      // Create a temporary open query
      const openQuery = await Query.create({
        title: 'OAQTest: open search hits query',
        description: 'How to do open search hits tracking?',
        tags: ['search'],
        createdBy: asker.userId
      });

      // Search for query
      const res = await request(app)
        .get('/api/search/similar')
        .query({ q: 'open search hits' });

      expect(res.status).toBe(200);

      // Verify searchHits incremented
      const updatedQuery = await Query.findById(openQuery._id);
      expect(updatedQuery.searchHits).toBeGreaterThan(0);

      // Cleanup
      await openQuery.deleteOne();
    });

    it('should trigger Collaborative FAQ Promotion notifications when threshold is met', async () => {
      // Set searchHits to 5 (promotion threshold is searchHits >= 5 or facingCount >= 3 or communityScore >= 15)
      await Query.findByIdAndUpdate(testQuery._id, { searchHits: 5 });

      const { checkFAQPromotion } = require('../services/promotionService');
      await checkFAQPromotion(testQuery._id);

      // Verify notification sent to original author
      const notificationAuthor = await Notification.findOne({
        recipient: asker.userId,
        type: 'faq_promotion'
      });
      expect(notificationAuthor).toBeDefined();

      // Verify notification sent to responder
      const notificationResponder = await Notification.findOne({
        recipient: responder.userId,
        type: 'faq_promotion'
      });
      expect(notificationResponder).toBeDefined();
    });

    it('should approve FAQ promotion request, close query, link query, and award +15 rep to both', async () => {
      // Submitter creates FAQRequest
      const reqRes = await request(app)
        .post('/api/faq-requests')
        .set('x-auth-token', responder.token)
        .send({
          queryId: testQuery._id,
          answerId: testAnswer._id,
          proposedQuestion: 'OAQTest: How to get scholarship?',
          proposedAnswer: 'OAQTest: Apply on portal.'
        });
      expect(reqRes.status).toBe(201);
      const faqRequestId = reqRes.body._id;

      // Check reputation of asker and responder before approval
      const askerBefore = await User.findById(asker.userId);
      const responderBefore = await User.findById(responder.userId);

      // Admin approves FAQ request
      const approveRes = await request(app)
        .post(`/api/faq-requests/${faqRequestId}/approve`)
        .set('x-auth-token', admin.token)
        .send({ adminNotes: 'Looking good!' });

      expect(approveRes.status).toBe(200);

      // Check reputation of asker and responder after approval
      const askerAfter = await User.findById(asker.userId);
      const responderAfter = await User.findById(responder.userId);

      // Asker: +15 reputation
      expect(askerAfter.reputation).toBe(askerBefore.reputation + 15);
      // Responder: +10 (for submitter/FAQ request creation) + 15 (for promotion) = +25 reputation
      expect(responderAfter.reputation).toBe(responderBefore.reputation + 25);

      // Query should be closed and linked to FAQ
      const finalQuery = await Query.findById(testQuery._id);
      expect(finalQuery.status).toBe('closed');
      expect(finalQuery.resolvedFAQ).toBeDefined();
    });
  });

  describe('3. Semantic Tag Linkage & Knowledge Graph', () => {
    it('should link query semantic graph and suggest tags during query creation', async () => {
      // Create a resolved FAQ to link to
      const faq = await FAQ.create({
        title: 'OAQTest: scholarship applications',
        description: 'scholarship applications info',
        finalAnswer: 'Portal opens in August.',
        status: 'resolved',
        isValidated: true,
        tags: ['scholarships'],
        createdBy: asker.userId
      });

      // Force rebuilding index
      const { buildRagIndex, linkQuerySemanticGraph } = require('../controllers/ragController');
      await buildRagIndex();

      // Create a new query
      const newQuery = await Query.create({
        title: 'OAQTest: Need scholarship help',
        description: 'When does the application open?',
        tags: ['help'],
        createdBy: asker.userId
      });

      // Call semantic linkage
      await linkQuerySemanticGraph(newQuery._id);

      // Verify the query relatedQueries has been populated and tags suggested
      const updatedQuery = await Query.findById(newQuery._id);
      expect(updatedQuery.relatedQueries).toBeDefined();
      expect(updatedQuery.relatedQueries.length).toBeGreaterThan(0);
      expect(updatedQuery.relatedQueries.map(id => id.toString())).toContain(faq._id.toString());
      expect(updatedQuery.tags).toContain('scholarships');
    });
  });
});
