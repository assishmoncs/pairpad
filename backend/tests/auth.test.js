// Integration tests for authentication endpoints (requires MongoDB)
const request = require('supertest');
const mongoose = require('mongoose');

describe('Authentication Endpoints', () => {
  let app;
  let authToken;
  let mongoAvailable = true;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_jwt_secret_for_testing_only';

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pairpad_test';
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 });
    } catch {
      console.warn('[auth.test.js] MongoDB not reachable. Skipping authentication integration tests.');
      mongoAvailable = false;
      return;
    }

    app = require('../src/server');
  });

  afterAll(async () => {
    if (app && app.close) {
      await app.close();
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user with valid credentials', async () => {
      if (!mongoAvailable) return;

      const testEmail = `test${Date.now()}@example.com`;
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: testEmail,
          password: 'password123',
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.token).toBeUndefined();
      expect(response.body.data.user.email).toBe(testEmail);
      expect(response.body.data.user._id).toBeDefined();
      expect(response.body.data.user.password).toBeUndefined();
    });

    it('should reject registration with weak password', async () => {
      if (!mongoAvailable) return;

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: `weak${Date.now()}@example.com`,
          password: '123',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });

    it('should reject registration with invalid email', async () => {
      if (!mongoAvailable) return;

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'invalid-email',
          password: 'password123',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    let testUserEmail;

    beforeAll(async () => {
      if (!mongoAvailable) return;

      testUserEmail = `login_test${Date.now()}@example.com`;
      await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Login Test User',
          email: testUserEmail,
          password: 'password123',
        });
    });

    it('should login with valid credentials', async () => {
      if (!mongoAvailable) return;

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserEmail,
          password: 'password123',
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.token).toBeUndefined();
      expect(response.body.data.user._id).toBeDefined();

      authToken = response.body.data.token;
    });

    it('should reject login with wrong password', async () => {
      if (!mongoAvailable) return;

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserEmail,
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
    });

    it('should reject login with non-existent email', async () => {
      if (!mongoAvailable) return;

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    let testUserEmail;

    beforeAll(async () => {
      if (!mongoAvailable) return;

      testUserEmail = `me_test${Date.now()}@example.com`;
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Me Test User',
          email: testUserEmail,
          password: 'password123',
        });
      authToken = registerResponse.body.data?.token;
    });

    it('should return current user with valid token', async () => {
      if (!mongoAvailable) return;

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.email).toBe(testUserEmail);
      expect(response.body.data.user._id).toBeDefined();
    });

    it('should reject request without token', async () => {
      if (!mongoAvailable) return;

      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      if (!mongoAvailable) return;

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid_token');

      expect(response.status).toBe(401);
    });
  });
});
