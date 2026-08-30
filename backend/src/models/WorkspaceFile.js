const mongoose = require('mongoose');

const workspaceFileSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    path: { type: String, required: true, trim: true, maxlength: 240 },
    language: {
      type: String,
      required: true,
      enum: ['javascript', 'python', 'java', 'cpp', 'c', 'go', 'rust', 'typescript', 'php', 'ruby'],
    },
    snapshotCode: { type: String, default: '', maxlength: 524288 },
    crdtState: { type: String, default: '', maxlength: 4194304 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

workspaceFileSchema.index({ room: 1, path: 1 }, { unique: true });
workspaceFileSchema.index({ room: 1, updatedAt: -1 });

module.exports = mongoose.model('WorkspaceFile', workspaceFileSchema);
