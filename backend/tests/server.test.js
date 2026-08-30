process.env.JWT_SECRET = 'secret';
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
  afterAll((done) => {
    if (app.close) {
      try {
        app.close(done);
      } catch {
        done();
      }
    } else {
      done();
    }
  });
});
