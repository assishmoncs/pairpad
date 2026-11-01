process.env.JWT_SECRET = 'secret';
process.env.PORT = '0';
jest.mock('../src/config/db', () => jest.fn().mockResolvedValue(true));

const request = require('supertest');
const app = require('../src/server');

describe('Server', () => {
  it('health check', async () => {
    await request(app).get('/health').expect(200);
  });
  it('ready check', async () => {
    await request(app).get('/ready').expect(503);
  });
  it('metrics check', async () => {
    process.env.METRICS_TOKEN = 'token123';
    await request(app).get('/metrics').set('x-metrics-token', 'token123').expect(200);
  });
  it('serves the OpenAPI contract', async () => {
    const response = await request(app).get('/api/openapi.yaml').expect(200);
    expect(response.text).toContain('openapi: 3.1.0');
  });
  it('serves the API documentation page', async () => {
    const response = await request(app).get('/api/docs').expect(200);
    expect(response.text).toContain('/api/openapi.yaml');
  });
  it('rejects an incorrect metrics token', async () => {
    process.env.METRICS_TOKEN = 'token123';
    await request(app).get('/metrics').set('x-metrics-token', 'incorrect').expect(401);
  });
  it('accepts a Bearer metrics token', async () => {
    process.env.METRICS_TOKEN = 'token123';
    await request(app).get('/metrics').set('Authorization', 'Bearer token123').expect(200);
  });
  it('hides unauthenticated metrics in production', async () => {
    const previousEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await request(app).get('/metrics').expect(404);
    } finally {
      process.env.NODE_ENV = previousEnvironment;
    }
  });
  it('allows metrics without a configured token outside production', async () => {
    delete process.env.METRICS_TOKEN;
    await request(app).get('/metrics').expect(200);
  });
  it('reports ready when MongoDB is connected and Redis is optional', async () => {
    const mongoose = require('mongoose');
    const previousState = mongoose.connection.readyState;
    const previousRedisRequired = process.env.REDIS_REQUIRED;
    mongoose.connection.readyState = 1;
    process.env.REDIS_REQUIRED = 'false';
    try {
      await request(app).get('/ready').expect(200);
    } finally {
      mongoose.connection.readyState = previousState;
      if (previousRedisRequired === undefined) delete process.env.REDIS_REQUIRED;
      else process.env.REDIS_REQUIRED = previousRedisRequired;
    }
  });
  afterAll(async () => {
    if (app && app.close) {
      await app.close();
    }
  });
});
