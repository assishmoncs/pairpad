const crypto = require('crypto');
const WorkspaceFile = require('../models/WorkspaceFile');

const SUPPORTED = new Set(['javascript', 'python', 'java', 'cpp', 'c', 'go', 'rust', 'typescript', 'php', 'ruby']);
const EXTENSIONS = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python',
  java: 'java',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  c: 'c', h: 'c',
  go: 'go',
  rs: 'rust',
  ts: 'typescript',
  php: 'php',
  rb: 'ruby',
};

const isSafePathPart = (part) => {
  if (!part || part.length > 240) return false;
  for (const char of part) {
    const code = char.charCodeAt(0);
    const alphanumeric = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    if (!alphanumeric && char !== '.' && char !== '_' && char !== '-') return false;
  }
  return true;
};

const normalizePath = (value) => {
  if (typeof value !== 'string') return '';

  const raw = value.trim().replaceAll('\\', '/');
  if (!raw || raw.length > 240 || raw.includes('..')) return '';

  const parts = raw.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => !isSafePathPart(part))) return '';

  return parts.join('/');
};

const detectLanguage = (filePath, requested) => {
  const language = typeof requested === 'string' ? requested.toLowerCase() : '';
  if (SUPPORTED.has(language)) return language;
  const ext = filePath.split('.').pop()?.toLowerCase();
  return EXTENSIONS[ext] || 'javascript';
};

const validateFilePath = (filePath) => {
  const path = normalizePath(filePath);
  if (!path) throw Object.assign(new Error('File path must be relative and use only letters, numbers, dots, underscores, hyphens, and folders.'), { code: 'INVALID_FILE_PATH' });
  if (!path.includes('.')) throw Object.assign(new Error('File path must include a filename extension.'), { code: 'INVALID_FILE_PATH' });
  return path;
};

const ensureDefaultFile = async (room, createdBy) => {
  const existing = await WorkspaceFile.findOne({ room: room._id }).lean();
  if (existing) return existing;
  const path = `main.${room.language === 'python' ? 'py' : room.language === 'cpp' ? 'cpp' : room.language === 'c' ? 'c' : room.language === 'java' ? 'java' : room.language === 'go' ? 'go' : room.language === 'rust' ? 'rs' : room.language === 'typescript' ? 'ts' : room.language === 'php' ? 'php' : room.language === 'ruby' ? 'rb' : 'js'}`;
  const file = await WorkspaceFile.create({
    room: room._id,
    name: path,
    path,
    language: detectLanguage(path, room.language),
    snapshotCode: room.snapshotCode || '',
    crdtState: room.crdtState || '',
    createdBy,
  });
  return file.toObject();
};

const listFiles = async (room, createdBy) => {
  await ensureDefaultFile(room, createdBy);
  return WorkspaceFile.find({ room: room._id }).select('_id name path language createdBy createdAt updatedAt').sort({ path: 1 }).lean();
};

const findFile = async (roomId, fileId) => WorkspaceFile.findOne({ _id: fileId, room: roomId });

const createFile = async (room, userId, payload = {}) => {
  const path = validateFilePath(payload.path || payload.name);
  const existing = await WorkspaceFile.findOne({ room: room._id, path }).lean();
  if (existing) throw Object.assign(new Error('A file with this path already exists.'), { code: 'FILE_EXISTS' });
  const name = path.split('/').pop();
  const content = typeof payload.content === 'string' ? payload.content : '';
  if (Buffer.byteLength(content, 'utf8') > 524288) throw Object.assign(new Error('File content must not exceed 512KB.'), { code: 'INVALID_FILE' });
  const file = await WorkspaceFile.create({ room: room._id, name, path, language: detectLanguage(path, payload.language), snapshotCode: content, createdBy: userId });
  return file.toObject();
};

const renameFile = async (roomId, fileId, nextPath) => {
  const file = await findFile(roomId, fileId);
  if (!file) throw Object.assign(new Error('File not found.'), { code: 'NOT_FOUND' });
  const path = validateFilePath(nextPath);
  const duplicate = await WorkspaceFile.findOne({ room: roomId, path, _id: { $ne: fileId } }).lean();
  if (duplicate) throw Object.assign(new Error('A file with this path already exists.'), { code: 'FILE_EXISTS' });
  file.path = path;
  file.name = path.split('/').pop();
  file.language = detectLanguage(path, file.language);
  await file.save();
  return file.toObject();
};

const deleteFile = async (roomId, fileId) => {
  const count = await WorkspaceFile.countDocuments({ room: roomId });
  if (count <= 1) throw Object.assign(new Error('A workspace must contain at least one file.'), { code: 'LAST_FILE' });
  const result = await WorkspaceFile.findOneAndDelete({ _id: fileId, room: roomId });
  if (!result) throw Object.assign(new Error('File not found.'), { code: 'NOT_FOUND' });
  return result.toObject();
};

const fileKey = (roomCode, fileId) => `workspace:${roomCode}:${String(fileId)}`;
const newFileId = () => crypto.randomUUID();

module.exports = { SUPPORTED, EXTENSIONS, detectLanguage, validateFilePath, ensureDefaultFile, listFiles, findFile, createFile, renameFile, deleteFile, fileKey, newFileId };
