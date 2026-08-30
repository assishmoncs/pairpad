const express = require('express');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/workspaceController');

const router = express.Router();
router.use(authMiddleware);
router.get('/:roomCode/files', asyncHandler(controller.getFiles));
router.get('/:roomCode/files/:fileId', asyncHandler(controller.getFile));
router.post('/:roomCode/files', asyncHandler(controller.create));
router.patch('/:roomCode/files/:fileId', asyncHandler(controller.rename));
router.delete('/:roomCode/files/:fileId', asyncHandler(controller.remove));

module.exports = router;
