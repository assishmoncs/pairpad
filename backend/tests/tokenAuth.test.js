jest.mock('../src/models/User');

const jwt = require('jsonwebtoken');
const tokenAuth = require('../src/utils/tokenAuth');
const User = require('../src/models/User');

describe('tokenAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'token-auth-secret';
  });

  it('loads matching user for valid access token', async () => {
    const token = jwt.sign({ userId: 'u1', type: 'access' }, process.env.JWT_SECRET);
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'u1', name: 'Alice' }),
    });

    const user = await tokenAuth.getUserFromToken(token);
    expect(user).toEqual({ _id: 'u1', name: 'Alice' });
    expect(User.findById).toHaveBeenCalledWith('u1');
  });

  it('rejects refresh token used for auth', async () => {
    const token = jwt.sign({ userId: 'u1', type: 'refresh' }, process.env.JWT_SECRET);
    await expect(tokenAuth.getUserFromToken(token)).rejects.toThrow(
      'Refresh tokens cannot be used for authentication.'
    );
  });
});
