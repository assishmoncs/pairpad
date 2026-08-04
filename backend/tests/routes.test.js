// Route wiring tests: verify each path reaches the right handler behind auth.
const mockHandlerNames = [
  'register',
  'login',
  'getMe',
  'createRoom',
  'getUserRooms',
  'getRoom',
  'joinRoom',
  'leaveRoom',
  'transferOwnership',
  'deleteRoom',
  'executeCode',
];

const mockHandlers = Object.fromEntries(
  mockHandlerNames.map((name) => [
    name,
    jest.fn((req, res) => res.json({ handler: name, params: req.params })),
  ])
);

jest.mock('../src/controllers/authController', () => ({
  register: (...args) => mockHandlers.register(...args),
  login: (...args) => mockHandlers.login(...args),
  getMe: (...args) => mockHandlers.getMe(...args),
}));
jest.mock('../src/controllers/roomController', () => ({
  createRoom: (...args) => mockHandlers.createRoom(...args),
  getUserRooms: (...args) => mockHandlers.getUserRooms(...args),
  getRoom: (...args) => mockHandlers.getRoom(...args),
  joinRoom: (...args) => mockHandlers.joinRoom(...args),
  leaveRoom: (...args) => mockHandlers.leaveRoom(...args),
  transferOwnership: (...args) => mockHandlers.transferOwnership(...args),
  deleteRoom: (...args) => mockHandlers.deleteRoom(...args),
}));
jest.mock('../src/controllers/executeController', () => ({
  executeCode: (...args) => mockHandlers.executeCode(...args),
}));
jest.mock('../src/middleware/auth', () => jest.fn((req, _res, next) => {
  req.user = { _id: 'user-1' };
  next();
}));

const express = require('express');
const request = require('supertest');
const authMiddleware = require('../src/middleware/auth');
const authRoutes = require('../src/routes/authRoutes');
const roomRoutes = require('../src/routes/roomRoutes');
const executeRoutes = require('../src/routes/executeRoutes');

const io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

const app = express();
app.use(express.json());
app.set('io', io);
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/execute', executeRoutes);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('auth routes', () => {
  it.each([
    ['post', '/api/auth/register', 'register'],
    ['post', '/api/auth/login', 'login'],
  ])('%s %s is public', async (method, path, handler) => {
    const response = await request(app)[method](path).send({});

    expect(response.body.handler).toBe(handler);
    expect(authMiddleware).not.toHaveBeenCalled();
  });

  it('GET /api/auth/me is protected', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(authMiddleware).toHaveBeenCalled();
    expect(response.body.handler).toBe('getMe');
  });
});

describe('room routes', () => {
  it.each([
    ['post', '/api/rooms', 'createRoom', {}],
    ['get', '/api/rooms', 'getUserRooms', {}],
    ['get', '/api/rooms/ABC123', 'getRoom', { identifier: 'ABC123' }],
    ['post', '/api/rooms/ABC123/join', 'joinRoom', { roomCode: 'ABC123' }],
    ['post', '/api/rooms/ABC123/leave', 'leaveRoom', { roomCode: 'ABC123' }],
    ['post', '/api/rooms/ABC123/transfer', 'transferOwnership', { roomCode: 'ABC123' }],
    ['delete', '/api/rooms/ABC123', 'deleteRoom', { roomCode: 'ABC123' }],
  ])('%s %s reaches %s behind auth', async (method, path, handler, params) => {
    const response = await request(app)[method](path).send({});

    expect(authMiddleware).toHaveBeenCalled();
    expect(response.body).toEqual({ handler, params });
  });
});

describe('execute route', () => {
  it('attaches the io instance and delegates to the controller behind auth', async () => {
    mockHandlers.executeCode.mockImplementation((req, res) => {
      expect(req.io).toBe(io);
      res.json({ handler: 'executeCode' });
    });

    const response = await request(app).post('/api/execute').send({});

    expect(authMiddleware).toHaveBeenCalled();
    expect(response.body.handler).toBe('executeCode');
  });
});
