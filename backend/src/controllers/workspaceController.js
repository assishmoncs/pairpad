const { findRoomByCode, isRoomParticipant } = require('../utils/roomAccess');
const { getRoomRole } = require('../utils/roomAccess');
const { canEdit } = require('../utils/roomPermissions');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { listFiles, findFile, createFile, renameFile, deleteFile } = require('../services/workspaceFileService');

const loadRoom = (roomCode) => findRoomByCode(roomCode);
const requireMember = async (roomCode, userId) => {
  const room = await loadRoom(roomCode);
  return room && isRoomParticipant(room, userId) ? room : null;
};

const getFiles = async (req, res) => {
  try {
    const room = await requireMember(req.params.roomCode, req.user._id);
    if (!room) return sendError(res, 404, 'Room not found or access denied.');
    const files = await listFiles(room, req.user._id);
    return sendSuccess(res, 'Workspace files retrieved successfully.', { files });
  } catch (error) {
    logger.error('Get workspace files error', { message: error.message });
    return sendError(res, 500, 'Failed to retrieve workspace files.');
  }
};

const getFile = async (req, res) => {
  try {
    const room = await requireMember(req.params.roomCode, req.user._id);
    if (!room) return sendError(res, 404, 'Room not found or access denied.');
    const file = await findFile(room._id, req.params.fileId);
    if (!file) return sendError(res, 404, 'File not found.');
    return sendSuccess(res, 'Workspace file retrieved successfully.', { file });
  } catch (error) {
    logger.error('Get workspace file error', { message: error.message });
    return sendError(res, 500, 'Failed to retrieve workspace file.');
  }
};

const create = async (req, res) => {
  try {
    const room = await requireMember(req.params.roomCode, req.user._id);
    if (!room) return sendError(res, 404, 'Room not found or access denied.');
    if (!canEdit(getRoomRole(room, req.user._id))) return sendError(res, 403, 'Editor permission required.');
    const file = await createFile(room, req.user._id, req.body || {});
    req.app.get('io')?.to(`room:${room.roomCode}`).emit('workspace-file-created', { file: { ...file, _id: String(file._id) } });
    return sendSuccess(res, 'Workspace file created successfully.', { file }, { status: 201 });
  } catch (error) {
    logger.error('Create workspace file error', { message: error.message });
    const status = ['INVALID_FILE_PATH', 'FILE_EXISTS', 'INVALID_FILE'].includes(error.code) ? 400 : error.code === 'FORBIDDEN' ? 403 : 500;
    return sendError(res, status, error.message || 'Failed to create workspace file.');
  }
};

const rename = async (req, res) => {
  try {
    const room = await requireMember(req.params.roomCode, req.user._id);
    if (!room) return sendError(res, 404, 'Room not found or access denied.');
    if (!canEdit(getRoomRole(room, req.user._id))) return sendError(res, 403, 'Editor permission required.');
    const file = await renameFile(room._id, req.params.fileId, req.body?.path);
    req.app.get('io')?.to(`room:${room.roomCode}`).emit('workspace-file-renamed', { file: { ...file, _id: String(file._id) } });
    return sendSuccess(res, 'Workspace file renamed successfully.', { file });
  } catch (error) {
    logger.error('Rename workspace file error', { message: error.message });
    const status = ['INVALID_FILE_PATH', 'FILE_EXISTS'].includes(error.code) ? 400 : error.code === 'NOT_FOUND' ? 404 : 500;
    return sendError(res, status, error.message || 'Failed to rename workspace file.');
  }
};

const remove = async (req, res) => {
  try {
    const room = await requireMember(req.params.roomCode, req.user._id);
    if (!room) return sendError(res, 404, 'Room not found or access denied.');
    if (!canEdit(getRoomRole(room, req.user._id))) return sendError(res, 403, 'Editor permission required.');
    const file = await deleteFile(room._id, req.params.fileId);
    req.app.get('io')?.to(`room:${room.roomCode}`).emit('workspace-file-deleted', { fileId: String(file._id) });
    return sendSuccess(res, 'Workspace file deleted successfully.', { fileId: String(file._id) });
  } catch (error) {
    logger.error('Delete workspace file error', { message: error.message });
    const status = error.code === 'LAST_FILE' ? 400 : error.code === 'NOT_FOUND' ? 404 : 500;
    return sendError(res, status, error.message || 'Failed to delete workspace file.');
  }
};

module.exports = { getFiles, getFile, create, rename, remove };
