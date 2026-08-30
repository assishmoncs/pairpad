jest.mock('../src/services/executionService', () => ({
  executeCode: jest.fn(),
}));

const executionService = require('../src/services/executionService');
const {
  validateConfig,
  sanitizePublicInterview,
  submitCandidate,
} = require('../src/services/interviewService');

const owner = '507f1f77bcf86cd799439011';
const editor = '507f1f77bcf86cd799439012';

const room = (overrides = {}) => ({
  owner,
  memberRoles: [{ user: owner, role: 'owner' }, { user: editor, role: 'editor' }],
  members: [owner, editor],
  interview: {
    title: 'Two Sum', description: 'Return the target pair.', language: 'javascript', durationMinutes: 30,
    status: 'running', startedAt: new Date(), pausedAt: null, endedAt: null, remainingSeconds: 1800,
    candidateId: editor,
    publicTests: [{ id: 'pub1', name: 'Example', stdin: '2 3', expectedOutput: '5', hidden: false }],
    hiddenTests: [{ id: 'hid1', name: 'Edge secret', stdin: '9 1', expectedOutput: '10', hidden: true }],
    save: jest.fn(async function save() { return this; }),
    ...overrides,
  },
  ...overrides,
});

test('validateConfig enforces duration and required fields', () => {
  expect(() => validateConfig({ title: '', description: 'x', durationMinutes: 10, language: 'javascript' })).toThrow(/title/i);
  expect(() => validateConfig({ title: 'x', description: 'y', durationMinutes: 0, language: 'javascript' })).toThrow(/between/i);
  const value = validateConfig({ title: 'x', description: 'y', durationMinutes: 30, language: 'JavaScript' });
  expect(value.language).toBe('javascript');
  expect(value.publicTests).toHaveLength(0);
});

test('public interview sanitization never includes hidden tests', () => {
  const safe = sanitizePublicInterview(room().interview);
  expect(safe.hiddenTests).toBeUndefined();
  expect(safe.publicTests[0].expectedOutput).toBe('5');
});

test('candidate receives hidden pass/fail metadata without hidden output', async () => {
  executionService.executeCode
    .mockResolvedValueOnce({ stdout: '5', status: 'success', time: '0.01', memory: '10' })
    .mockResolvedValueOnce({ stdout: '10', status: 'success', time: '0.01', memory: '10' });
  const result = await submitCandidate(room(), editor, 'console.log(5)', 'javascript');
  expect(result.score).toBe(2);
  expect(result.hiddenResults[0].passed).toBe(true);
  expect(result.hiddenResults[0].actualOutput).toBe('10');
});

test('assigned candidate restriction is enforced', async () => {
  const other = '507f1f77bcf86cd799439013';
  await expect(submitCandidate(room(), other, 'code', 'javascript')).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('expired running interview rejects submission and ends interview', async () => {
  const expired = room();
  expired.interview.startedAt = new Date(Date.now() - 5000);
  expired.interview.remainingSeconds = 1;
  await expect(submitCandidate(expired, editor, 'code', 'javascript')).rejects.toMatchObject({ code: 'INVALID_STATE' });
  expect(expired.interview.status).toBe('ended');
  expect(expired.interview.remainingSeconds).toBe(0);
});
