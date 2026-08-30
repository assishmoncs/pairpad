const crypto = require('crypto');
const { getRoomRole } = require('../utils/roomAccess');
const { ROLES } = require('../utils/roomPermissions');
const executionService = require('./executionService');

const MAX_TESTS = 50;
const MAX_INPUT = 10000;
const MAX_EXPECTED = 10000;
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 5000;
const MIN_DURATION = 1;
const MAX_DURATION = 24 * 60;
const SUPPORTED_LANGUAGES = new Set(['javascript', 'python', 'java', 'cpp', 'c', 'go', 'rust', 'typescript', 'php', 'ruby']);
const statuses = new Set(['draft', 'running', 'paused', 'ended']);
const cleanText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const normalizeTests = (tests = [], hidden = false) => !Array.isArray(tests) ? [] : tests.slice(0, MAX_TESTS).map((test, index) => ({
  id: typeof test?.id === 'string' && test.id ? test.id : crypto.randomUUID(),
  name: cleanText(test?.name, 100) || `Test ${index + 1}`,
  stdin: cleanText(test?.stdin, MAX_INPUT),
  expectedOutput: cleanText(test?.expectedOutput, MAX_EXPECTED),
  hidden,
}));

const sanitizePublicInterview = (interview) => {
  if (!interview) return null;
  const plain = typeof interview.toObject === 'function' ? interview.toObject() : { ...interview };
  plain.publicTests = (plain.publicTests || []).map(({ id, name, stdin, expectedOutput }) => ({ id, name, stdin, expectedOutput }));
  delete plain.hiddenTests;
  return plain;
};

const sanitizeHostInterview = (interview) => {
  if (!interview) return null;
  const plain = typeof interview.toObject === 'function' ? interview.toObject() : { ...interview };
  plain.publicTests = (plain.publicTests || []).map(({ id, name, stdin, expectedOutput }) => ({ id, name, stdin, expectedOutput }));
  plain.hiddenTests = (plain.hiddenTests || []).map(({ id, name, stdin, expectedOutput }) => ({ id, name, stdin, expectedOutput }));
  return plain;
};

const validateConfig = (payload = {}) => {
  const title = cleanText(payload.title, MAX_TITLE);
  const description = cleanText(payload.description, MAX_DESCRIPTION);
  const durationMinutes = Number(payload.durationMinutes);
  const language = cleanText(payload.language, 30).toLowerCase();
  if (!title) throw Object.assign(new Error('Interview title is required.'), { code: 'INVALID_INTERVIEW' });
  if (!description) throw Object.assign(new Error('Interview problem statement is required.'), { code: 'INVALID_INTERVIEW' });
  if (!Number.isInteger(durationMinutes) || durationMinutes < MIN_DURATION || durationMinutes > MAX_DURATION) throw Object.assign(new Error(`Duration must be between ${MIN_DURATION} and ${MAX_DURATION} minutes.`), { code: 'INVALID_INTERVIEW' });
  if (!SUPPORTED_LANGUAGES.has(language)) throw Object.assign(new Error(`Unsupported interview language. Supported: ${[...SUPPORTED_LANGUAGES].join(', ')}`), { code: 'INVALID_INTERVIEW' });
  return { title, description, durationMinutes, language, publicTests: normalizeTests(payload.publicTests, false), hiddenTests: normalizeTests(payload.hiddenTests, true) };
};

const requireOwner = (room, userId) => {
  if (getRoomRole(room, userId) !== ROLES.OWNER) throw Object.assign(new Error('Only the room owner can manage interview mode.'), { code: 'FORBIDDEN' });
};

const isRoomMember = (room, userId) => room.members?.some((member) => String(member?._id || member) === String(userId));

const createOrUpdateInterview = async (room, userId, payload) => {
  requireOwner(room, userId);
  if (['running', 'paused'].includes(room.interview?.status)) throw Object.assign(new Error('Stop the active interview before editing its configuration.'), { code: 'INTERVIEW_ACTIVE' });
  const config = validateConfig(payload);
  if (config.candidateId && !isRoomMember(room, config.candidateId)) throw Object.assign(new Error('The candidate must be a member of the room.'), { code: 'INVALID_INTERVIEW' });
  const candidateId = payload.candidateId || null;
  room.interview = { ...config, candidateId, status: 'draft', startedAt: null, pausedAt: null, endedAt: null, remainingSeconds: config.durationMinutes * 60 };
  await room.save();
  return room.interview;
};

const startInterview = async (room, userId) => {
  requireOwner(room, userId);
  if (room.interview?.status !== 'draft') throw Object.assign(new Error('Interview must be in draft state before starting.'), { code: 'INVALID_STATE' });
  room.interview.status = 'running'; room.interview.startedAt = new Date(); room.interview.pausedAt = null; room.interview.endedAt = null; room.interview.remainingSeconds = Math.max(1, room.interview.durationMinutes * 60);
  await room.save(); return room.interview;
};

const pauseInterview = async (room, userId) => {
  requireOwner(room, userId);
  if (room.interview?.status !== 'running') throw Object.assign(new Error('Only a running interview can be paused.'), { code: 'INVALID_STATE' });
  const elapsed = Math.floor((Date.now() - new Date(room.interview.startedAt).getTime()) / 1000);
  room.interview.remainingSeconds = Math.max(0, room.interview.remainingSeconds - elapsed); room.interview.pausedAt = new Date(); room.interview.status = room.interview.remainingSeconds === 0 ? 'ended' : 'paused';
  if (room.interview.status === 'ended') room.interview.endedAt = new Date();
  await room.save(); return room.interview;
};

const resumeInterview = async (room, userId) => {
  requireOwner(room, userId);
  if (room.interview?.status !== 'paused') throw Object.assign(new Error('Only a paused interview can be resumed.'), { code: 'INVALID_STATE' });
  room.interview.status = 'running'; room.interview.startedAt = new Date(); room.interview.pausedAt = null;
  await room.save(); return room.interview;
};

const endInterview = async (room, userId) => {
  requireOwner(room, userId);
  if (!['running', 'paused'].includes(room.interview?.status)) throw Object.assign(new Error('Only an active interview can be ended.'), { code: 'INVALID_STATE' });
  room.interview.status = 'ended'; room.interview.endedAt = new Date();
  await room.save(); return room.interview;
};

const runTests = async (sourceCode, language, tests, includeExpected = false) => {
  const results = [];
  for (const test of tests) {
    const result = await executionService.executeCode(sourceCode, language, test.stdin || '');
    const actual = (result.stdout || '').trim(); const expected = (test.expectedOutput || '').trim();
    results.push({ id: test.id, name: test.name, passed: actual === expected && !result.stderr, actualOutput: actual, ...(includeExpected ? { expectedOutput: expected } : {}), status: result.status, time: result.time, memory: result.memory });
  }
  return results;
};

const submitCandidate = async (room, userId, sourceCode, language) => {
  if (!room.interview || room.interview.status !== 'running') throw Object.assign(new Error('Interview is not currently running.'), { code: 'INVALID_STATE' });
  const role = getRoomRole(room, userId);
  if (![ROLES.EDITOR, ROLES.OWNER].includes(role)) throw Object.assign(new Error('Editor permission is required to submit.'), { code: 'FORBIDDEN' });
  if (room.interview.candidateId && room.interview.candidateId.toString() !== userId.toString() && role !== ROLES.OWNER) throw Object.assign(new Error('This interview is assigned to a different candidate.'), { code: 'FORBIDDEN' });
  const startedAt = new Date(room.interview.startedAt).getTime();
  if (!Number.isNaN(startedAt) && Date.now() - startedAt >= room.interview.remainingSeconds * 1000) {
    room.interview.status = 'ended'; room.interview.endedAt = new Date(); room.interview.remainingSeconds = 0; await room.save();
    throw Object.assign(new Error('Interview time has expired.'), { code: 'INVALID_STATE' });
  }
  if (language.toLowerCase() !== room.interview.language.toLowerCase()) throw Object.assign(new Error('Submission language must match the interview language.'), { code: 'INVALID_INTERVIEW' });
  const publicResults = await runTests(sourceCode, language, room.interview.publicTests, true);
  const hiddenResults = await runTests(sourceCode, language, room.interview.hiddenTests, false);
  return { publicResults, hiddenResults, hiddenPassed: hiddenResults.filter((entry) => entry.passed).length, score: [...publicResults, ...hiddenResults].filter((entry) => entry.passed).length, total: publicResults.length + hiddenResults.length };
};

module.exports = { validateConfig, createOrUpdateInterview, startInterview, pauseInterview, resumeInterview, endInterview, submitCandidate, sanitizePublicInterview, sanitizeHostInterview, statuses, SUPPORTED_LANGUAGES };
