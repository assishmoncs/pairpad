jest.mock('../src/services/executionService', () => ({
  executeCode: jest.fn(),
}));

const executionService = require('../src/services/executionService');
const {
  startInterview,
  pauseInterview,
  resumeInterview,
  endInterview,
} = require('../src/services/interviewService');

const owner = '507f1f77bcf86cd799439011';
const editor = '507f1f77bcf86cd799439012';

const makeRoom = (status = 'draft') => ({
  owner,
  members: [owner, editor],
  memberRoles: [{ user: owner, role: 'owner' }, { user: editor, role: 'editor' }],
  interview: {
    title: 'Test', description: 'Solve it', language: 'javascript', durationMinutes: 10,
    status, startedAt: status === 'running' ? new Date() : null, pausedAt: null, endedAt: null,
    remainingSeconds: 600, publicTests: [], hiddenTests: [],
  },
  save: jest.fn(async function save() { return this; }),
});

test('owner can start, pause, resume and end interview', async () => {
  const room = makeRoom();
  await startInterview(room, owner);
  expect(room.interview.status).toBe('running');
  await pauseInterview(room, owner);
  expect(['paused', 'ended']).toContain(room.interview.status);
  if (room.interview.status === 'paused') {
    await resumeInterview(room, owner);
    expect(room.interview.status).toBe('running');
    await endInterview(room, owner);
  }
  expect(room.interview.status).toBe('ended');
});

test('non-owner cannot control interview lifecycle', async () => {
  const room = makeRoom();
  await expect(startInterview(room, editor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  room.interview.status = 'running';
  await expect(pauseInterview(room, editor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('invalid lifecycle transitions are rejected', async () => {
  const room = makeRoom('ended');
  await expect(startInterview(room, owner)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  await expect(resumeInterview(room, owner)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  expect(executionService.executeCode).not.toHaveBeenCalled();
});
