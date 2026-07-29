jest.mock('../src/models/Message', () => ({ find: jest.fn() }));
jest.mock('../src/models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../src/middleware/auth', () => (req, _res, next) => {
  req.user = { _id: { toString: () => 'user-1' } };
  next();
});

const express = require('express');
const request = require('supertest');
const Message = require('../src/models/Message');
const Room = require('../src/models/Room');
const messageRoutes = require('../src/routes/messageRoutes');

const USER_ID = 'user-1';
const OTHER_ID = 'user-2';

const app = express();
app.use(express.json());
app.use('/api/messages', messageRoutes);

// Mimics Message.find(...).populate(...).sort(...).limit(...)
const messageQuery = (messages) => ({
  populate: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue(messages),
    }),
  }),
});

const room = (memberId = USER_ID, ownerId = USER_ID) => ({
  _id: 'room-1',
  members: [{ _id: { toString: () => memberId } }],
  owner: { _id: { toString: () => ownerId } },
});

let consoleError;

beforeEach(() => {
  jest.clearAllMocks();
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('GET /api/messages/room/:roomCode', () => {
  it('returns the room history for a member', async () => {
    Room.findOne.mockResolvedValue(room());
    const messages = [{ _id: 'm1', content: 'hi' }];
    Message.find.mockReturnValue(messageQuery(messages));

    const response = await request(app).get('/api/messages/room/abc123');

    expect(Room.findOne).toHaveBeenCalledWith({ roomCode: 'ABC123' });
    expect(Message.find).toHaveBeenCalledWith({ room: 'room-1' });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ messages, count: 1 });
  });

  it('allows the owner even when not listed as a member', async () => {
    Room.findOne.mockResolvedValue(room(OTHER_ID, USER_ID));
    Message.find.mockReturnValue(messageQuery([]));

    const response = await request(app).get('/api/messages/room/ABC123');

    expect(response.status).toBe(200);
    expect(response.body.data.count).toBe(0);
  });

  it('returns 404 for an unknown room', async () => {
    Room.findOne.mockResolvedValue(null);

    const response = await request(app).get('/api/messages/room/ABC123');

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Room not found.');
  });

  it('returns 403 for a user outside the room', async () => {
    Room.findOne.mockResolvedValue(room(OTHER_ID, OTHER_ID));

    const response = await request(app).get('/api/messages/room/ABC123');

    expect(response.status).toBe(403);
    expect(response.body.message).toBe(
      'You are not authorized to access messages in this room.'
    );
  });

  it('returns 500 when the query fails', async () => {
    Room.findOne.mockRejectedValue(new Error('db down'));

    const response = await request(app).get('/api/messages/room/ABC123');

    expect(response.status).toBe(500);
    expect(response.body.message).toBe(
      'Failed to retrieve messages. Please try again.'
    );
  });
});
