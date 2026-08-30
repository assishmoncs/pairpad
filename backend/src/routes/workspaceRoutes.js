const express = require('express');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/workspaceController');

const router = express.Router();
router.use(authMiddleware);
router.get('/rooms/:roomCode/files', asyncHandler(controller.getFiles));
router.get('/rooms/:roomCode/files/:fileId', asyncHandler(controller.getFile));
router.post('/rooms/:roomCode/files', asyncHandler(controller.create));
router.patch('/rooms/:roomCode/files/:fileId', asyncHandler(controller.rename));
router.delete('/rooms/:roomCode/files/:fileId', asyncHandler(controller.remove));

module.exports = router;
