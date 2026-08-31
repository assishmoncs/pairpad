const mongoose = require('mongoose');
const roomInterviewSchema = require('./RoomInterview');

const roomMemberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'editor', 'viewer'], default: 'editor' },
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Room name is required'],
      trim: true,
      minlength: 1,
      maxlength: 50,
    },
    roomCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9]{6}$/, 'Room code must be 6 alphanumeric characters'],
    },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    memberRoles: { type: [roomMemberSchema], default: [] },
    language: {
      type: String,
      default: 'javascript',
      enum: ['javascript', 'python', 'java', 'cpp', 'c', 'go', 'rust', 'typescript', 'php', 'ruby'],
    },
    description: { type: String, trim: true, maxlength: [200, 'Description cannot exceed 200 characters'] },
    snapshotCode: { type: String, default: '', maxlength: 524288 },
    crdtState: { type: String, default: '', maxlength: 4194304 },
    interview: { type: roomInterviewSchema, default: null },
  },
  { timestamps: true }
);

roomSchema.pre('save', function () {
  const ownerId = this.owner?.toString();
  const roles = new Map((this.memberRoles || []).map((entry) => [entry.user.toString(), entry.role]));

  if (!this.members.some((memberId) => memberId.toString() === ownerId)) {
    this.members.push(this.owner);
  }

  for (const memberId of this.members || []) {
    const id = memberId.toString();
    if (!roles.has(id)) {
      this.memberRoles.push({ user: memberId, role: id === ownerId ? 'owner' : 'editor' });
    }
  }

  const ownerRole = this.memberRoles.find((entry) => entry.user.toString() === ownerId);
  if (ownerRole) ownerRole.role = 'owner';
});

roomSchema.index({ members: 1, createdAt: -1 });
roomSchema.index({ 'memberRoles.user': 1, createdAt: -1 });
roomSchema.index({ 'interview.status': 1, 'interview.startedAt': -1 });

module.exports = mongoose.model('Room', roomSchema);
