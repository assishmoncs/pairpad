const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Room name is required'],
      trim: true,
      minlength: [1, 'Room name must be at least 1 character'],
      maxlength: [50, 'Room name cannot exceed 50 characters'],
    },
    roomCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9]{6}$/, 'Room code must be 6 alphanumeric characters'],
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    language: {
      type: String,
      default: 'javascript',
      enum: ['javascript', 'python', 'java', 'cpp', 'c', 'go', 'rust', 'typescript', 'php', 'ruby'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, 'Description cannot exceed 200 characters'],
    },
    snapshotCode: {
      type: String,
      default: '',
      maxlength: [524288, 'Code snapshot cannot exceed 512KB'],
    },
  },
  {
    timestamps: true,
  }
);

// Ensure owner is always in members list
roomSchema.pre('save', function (next) {
  if (this.isNew && !this.members.includes(this.owner)) {
    this.members.push(this.owner);
  }
  next();
});

roomSchema.index({ members: 1, createdAt: -1 });

module.exports = mongoose.model('Room', roomSchema);
