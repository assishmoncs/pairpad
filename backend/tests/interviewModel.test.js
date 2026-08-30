const interviewSchema = require('../src/models/RoomInterview');

test('interview schema enforces lifecycle, duration and bounded tests', () => {
  expect(interviewSchema.path('status').enumValues).toEqual(['draft', 'running', 'paused', 'ended']);
  expect(interviewSchema.path('durationMinutes').options.min).toBe(1);
  expect(interviewSchema.path('durationMinutes').options.max).toBe(1440);
  expect(interviewSchema.path('publicTests').schema.path('stdin').options.maxlength).toBe(10000);
  expect(interviewSchema.path('hiddenTests').schema.path('expectedOutput').options.maxlength).toBe(10000);
});
