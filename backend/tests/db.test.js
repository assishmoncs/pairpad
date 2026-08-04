jest.mock('mongoose', () => ({ connect: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(() => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), fatal: jest.fn() })),
}));

const mongoose = require('mongoose');
const logger = require('../src/utils/logger');

// db.js reads MONGODB_URI at require time.
const loadConnectDB = (uri) => {
  let connectDB;
  jest.isolateModules(() => {
    if (uri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = uri;
    }
    connectDB = require('../src/config/db');
  });
  return connectDB;
};

const ORIGINAL_URI = process.env.MONGODB_URI;

let consoleLog;
let consoleError;

beforeEach(() => {
  jest.clearAllMocks();
  consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleLog.mockRestore();
  consoleError.mockRestore();
});

afterAll(() => {
  if (ORIGINAL_URI === undefined) {
    delete process.env.MONGODB_URI;
  } else {
    process.env.MONGODB_URI = ORIGINAL_URI;
  }
});

describe('connectDB', () => {
  it('connects using MONGODB_URI', async () => {
    mongoose.connect.mockResolvedValue(undefined);

    await loadConnectDB('mongodb://db.test:27017/pairpad')();

    expect(mongoose.connect).toHaveBeenCalledWith('mongodb://db.test:27017/pairpad');
  });

  it('falls back to the local default URI', async () => {
    mongoose.connect.mockResolvedValue(undefined);

    await loadConnectDB(undefined)();

    expect(mongoose.connect).toHaveBeenCalledWith(
      'mongodb://127.0.0.1:27017/pairpad'
    );
  });

  it('rethrows connection failures so the caller can abort startup', async () => {
    mongoose.connect.mockRejectedValue(new Error('connection refused'));

    await expect(loadConnectDB('mongodb://db.test/pairpad')()).rejects.toThrow(
      'connection refused'
    );
    expect(logger.error).toHaveBeenCalled();
  });
});
