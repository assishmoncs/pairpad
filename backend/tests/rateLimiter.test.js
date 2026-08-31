const express = require('express');
const request = require('supertest');
const {
  apiLimiter,
  authLimiter,
  executeLimiter,
  socketLimiter,
} = require('../src/middleware/rateLimiter');

const appWith = (limiter) => {
  const app = express();
  app.use(limiter);
  app.get('/', (_req, res) => res.json({ ok: true }));
  return app;
};

const hit = (app, times) => {
  let chain = Promise.resolve();
  const responses = [];
  for (let i = 0; i < times; i++) {
    chain = chain.then(() => request(app).get('/').then((r) => responses.push(r)));
  }
  return chain.then(() => responses);
};

beforeAll(() => {
  process.env.TEST_RATE_LIMITER = 'true';
});

afterAll(() => {
  delete process.env.TEST_RATE_LIMITER;
});


describe('rate limiters', () => {
  it('blocks execution requests after 5 per minute', async () => {
    const responses = await hit(appWith(executeLimiter), 6);

    expect(responses.slice(0, 5).map((r) => r.status)).toEqual([
      200, 200, 200, 200, 200,
    ]);
    expect(responses[5].status).toBe(429);
    expect(responses[5].body.message).toMatch(/Too many code execution requests/);
  });

  it('blocks authentication requests after 10 per window', async () => {
    const responses = await hit(appWith(authLimiter), 11);

    expect(responses[9].status).toBe(200);
    expect(responses[10].status).toBe(429);
    expect(responses[10].body.message).toMatch(/Too many authentication attempts/);
  });

  it('lets normal API traffic through and exposes standard headers', async () => {
    const response = await request(appWith(apiLimiter)).get('/');

    expect(response.status).toBe(200);
    expect(response.headers['ratelimit-limit']).toBe('100');
    expect(response.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('exposes a socket connection limiter', () => {
    expect(typeof socketLimiter).toBe('function');
  });
});
