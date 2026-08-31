const mongoose = require('mongoose');

const interviewTestSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, maxlength: 100 },
    stdin: { type: String, default: '', maxlength: 10000 },
    expectedOutput: { type: String, default: '', maxlength: 10000 },
    hidden: { type: Boolean, default: false },
  },
  { _id: false }
);

const interviewSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 5000 },
    language: { type: String, required: true },
    durationMinutes: { type: Number, required: true, min: 1, max: 1440 },
    status: { type: String, enum: ['draft', 'running', 'paused', 'ended'], default: 'draft' },
    startedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    remainingSeconds: { type: Number, required: true, min: 0 },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publicTests: { type: [interviewTestSchema], default: [] },
    hiddenTests: { type: [interviewTestSchema], default: [] },
  },
  { _id: false }
);

module.exports = interviewSchema;
