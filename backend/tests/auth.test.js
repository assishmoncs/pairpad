// Basic test for authentication endpoints
const request = require('supertest');

// Mock the database and server
describe('Authentication Endpoints', () => {
  let app;
  let authToken;

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_jwt_secret_for_testing_only';
    
    // Import app after env is set
    app = require('../src/server');
  });

  afterAll(async () => {
    // Clean up
    if (app && app.close) {
      app.close();
    }
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user with valid credentials', async () => {
      const testEmail = `test${Date.now()}@example.com`;
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: testEmail,
          password: 'password123',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.email).toBe(testEmail);
      expect(response.body.data.user.password).toBeUndefined();
    });

    it('should reject registration with weak password', async () => {
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
      // Create a test user first
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
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserEmail,
          password: 'password123',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('user');
      
      authToken = response.body.token;
    });

    it('should reject login with wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserEmail,
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
    });

    it('should reject login with non-existent email', async () => {
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
      // Create a test user and get token
      testUserEmail = `me_test${Date.now()}@example.com`;
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Me Test User',
          email: testUserEmail,
          password: 'password123',
        });
      authToken = registerResponse.body.token;
    });

    it('should return current user with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.email).toBe(testUserEmail);
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid_token');

      expect(response.status).toBe(401);
    });
  });
});
