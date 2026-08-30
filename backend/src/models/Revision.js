const mongoose = require('mongoose');

const revisionSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: [524288, 'Revision cannot exceed 512KB'],
    },
    language: {
      type: String,
      required: true,
      enum: ['javascript', 'python', 'java', 'cpp', 'c', 'go', 'rust', 'typescript', 'php', 'ruby'],
    },
    message: {
      type: String,
      trim: true,
      maxlength: [120, 'Revision message cannot exceed 120 characters'],
      default: 'Automatic checkpoint',
    },
    source: {
      type: String,
      enum: ['automatic', 'manual', 'restore'],
      default: 'automatic',
    },
    restoredFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Revision',
      default: null,
    },
  },
  { timestamps: true }
);

revisionSchema.index({ room: 1, createdAt: -1 });
revisionSchema.index({ room: 1, author: 1, createdAt: -1 });

module.exports = mongoose.model('Revision', revisionSchema);
