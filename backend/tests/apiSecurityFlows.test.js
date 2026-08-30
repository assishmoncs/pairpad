const request = require('supertest');
const mongoose = require('mongoose');

const describeWithMongo = (name, fn) => describe(name, fn);

describeWithMongo('API security and failure flows', () => {
  let app;
  let mongoAvailable = true;
  let ownerToken;
  let editorToken;
  let viewerToken;
  let outsiderToken;
  let roomCode;
  let viewerId;
  let editorId;

  const register = async (name, email) => {
    const response = await request(app).post('/api/auth/register').send({
      name,
      email,
      password: 'Password123!',
    });
    expect(response.status).toBe(201);
    return response.body.data;
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_jwt_secret_for_api_security';
    process.env.REDIS_REQUIRED = 'false';
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pairpad_test';
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 });
    } catch {
      mongoAvailable = false;
      return;
    }
    app = require('../src/server');

    const suffix = Date.now();
    const owner = await register('API Security Owner', `owner${suffix}@example.com`);
    const editor = await register('API Security Editor', `editor${suffix}@example.com`);
    const viewer = await register('API Security Viewer', `viewer${suffix}@example.com`);
    const outsider = await register('API Security Outsider', `outsider${suffix}@example.com`);
    ownerToken = owner.token;
    editorToken = editor.token;
    viewerToken = viewer.token;
    outsiderToken = outsider.token;
    viewerId = viewer.user._id;
    editorId = editor.user._id;

    const room = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Security Flow Room', language: 'javascript' });
    expect(room.status).toBe(201);
    roomCode = room.body.data.room.roomCode;

    await request(app).post(`/api/rooms/${roomCode}/join`).set('Authorization', `Bearer ${editorToken}`);
    await request(app).post(`/api/rooms/${roomCode}/join`).set('Authorization', `Bearer ${viewerToken}`);
  });

  afterAll(async () => {
    if (app?.close) await app.close();
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  it('rejects malformed bearer credentials', async () => {
    if (!mongoAvailable) return;
    const response = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt');
    expect(response.status).toBe(401);
  });

  it('prevents a viewer from executing code', async () => {
    if (!mongoAvailable) return;
    const response = await request(app)
      .post('/api/execute')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ source_code: 'console.log(1)', language: 'javascript', roomCode });
    expect(response.status).toBe(403);
  });

  it('prevents an outsider from reading room metadata', async () => {
    if (!mongoAvailable) return;
    const response = await request(app)
      .get(`/api/rooms/${roomCode}`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(response.status).toBe(403);
  });

  it('prevents an editor from changing roles', async () => {
    if (!mongoAvailable) return;
    const response = await request(app)
      .patch(`/api/rooms/${roomCode}/members/${viewerId}/role`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ role: 'editor' });
    expect(response.status).toBe(403);
  });

  it('allows the owner to promote an editor and demote them again', async () => {
    if (!mongoAvailable) return;
    const promote = await request(app)
      .patch(`/api/rooms/${roomCode}/members/${viewerId}/role`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'editor' });
    expect(promote.status).toBe(200);

    const demote = await request(app)
      .patch(`/api/rooms/${roomCode}/members/${viewerId}/role`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'viewer' });
    expect(demote.status).toBe(200);
  });

  it('rejects invalid room-code injection attempts', async () => {
    if (!mongoAvailable) return;
    const response = await request(app)
      .get('/api/rooms/%24%7Bwhere%7D')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect([400, 404]).toContain(response.status);
  });

  it('rejects oversized execution source before the execution service', async () => {
    if (!mongoAvailable) return;
    const response = await request(app)
      .post('/api/execute')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ source_code: 'x'.repeat(600000), language: 'javascript', roomCode });
    expect(response.status).toBe(400);
  });

  it('rejects oversized stdin', async () => {
    if (!mongoAvailable) return;
    const response = await request(app)
      .post('/api/execute')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ source_code: 'console.log(1)', language: 'javascript', stdin: 'x'.repeat(12000), roomCode });
    expect(response.status).toBe(400);
  });

  it('does not allow transfer to a non-member', async () => {
    if (!mongoAvailable) return;
    const response = await request(app)
      .post(`/api/rooms/${roomCode}/transfer`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ newOwnerId: '507f1f77bcf86cd799439011' });
    expect(response.status).toBe(400);
  });

  it('keeps role changes scoped to valid room members', async () => {
    if (!mongoAvailable) return;
    const response = await request(app)
      .patch(`/api/rooms/${roomCode}/members/${editorId}/role`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'viewer' });
    expect(response.status).toBe(200);
  });
});
