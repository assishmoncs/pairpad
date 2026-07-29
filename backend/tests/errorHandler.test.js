const {
  ApiError,
  notFoundMiddleware,
  errorHandler,
} = require('../src/middleware/errorHandler');

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const ORIGINAL_ENV = process.env.NODE_ENV;

beforeEach(() => {
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
});

describe('ApiError', () => {
  it('marks 4xx errors as "fail" and keeps the message and errors list', () => {
    const err = new ApiError(400, 'Bad input', ['name is required']);

    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(400);
    expect(err.status).toBe('fail');
    expect(err.message).toBe('Bad input');
    expect(err.errors).toEqual(['name is required']);
    expect(err.isOperational).toBe(true);
    expect(err.stack).toBeDefined();
  });

  it('marks non-4xx errors as "error" and defaults errors to an empty array', () => {
    const err = new ApiError(500, 'Boom');

    expect(err.status).toBe('error');
    expect(err.errors).toEqual([]);
  });
});

describe('notFoundMiddleware', () => {
  it('forwards a 404 ApiError naming the requested URL', () => {
    const next = jest.fn();

    notFoundMiddleware({ originalUrl: '/api/nope' }, createRes(), next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Route /api/nope not found');
  });
});

describe('errorHandler', () => {
  it('defaults to a 500 "error" response', () => {
    const res = createRes();

    errorHandler(new Error(), {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Internal server error',
    });
  });

  it('uses the status code and message from an ApiError', () => {
    const res = createRes();

    errorHandler(new ApiError(403, 'Forbidden'), {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Forbidden',
    });
  });

  it('includes an errors array when the error carries one', () => {
    const res = createRes();

    errorHandler(new ApiError(400, 'Invalid', ['a', 'b']), {}, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Invalid',
      errors: ['a', 'b'],
    });
  });

  it('maps Mongoose validation errors to 400 with per-field messages', () => {
    const res = createRes();
    const err = new Error('Validation failed');
    err.name = 'ValidationError';
    err.errors = {
      name: { message: 'Name is required' },
      email: { message: 'Email is invalid' },
    };

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Validation failed',
      errors: ['Name is required', 'Email is invalid'],
    });
  });

  it('maps duplicate key errors to 400 naming the duplicated field', () => {
    const res = createRes();
    const err = new Error('E11000');
    err.code = 11000;
    err.keyValue = { email: 'taken@example.com' };

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Duplicate value for field: email',
    });
  });

  it('maps cast errors to a 400 invalid ID response', () => {
    const res = createRes();
    const err = new Error('Cast to ObjectId failed');
    err.name = 'CastError';

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Invalid ID format',
    });
  });

  it('maps JWT errors to 401', () => {
    const res = createRes();
    const err = new Error('jwt malformed');
    err.name = 'JsonWebTokenError';

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Invalid token',
    });
  });

  it('maps expired token errors to 401', () => {
    const res = createRes();
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Token expired',
    });
  });

  it('includes the stack trace in development', () => {
    process.env.NODE_ENV = 'development';
    const res = createRes();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const err = new ApiError(400, 'Oops');

    errorHandler(err, {}, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ stack: err.stack })
    );
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
