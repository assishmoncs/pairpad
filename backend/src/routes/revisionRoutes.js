const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const {
  getRevisions,
  getRevisionDiff,
  createManualRevision,
  restoreRevision,
} = require('../controllers/revisionController');

router.use(authMiddleware);

router.get('/:roomCode/history', asyncHandler(getRevisions));
router.get('/:roomCode/history/diff', asyncHandler(getRevisionDiff));
router.post('/:roomCode/history', asyncHandler(createManualRevision));
router.post('/:roomCode/history/:revisionId/restore', asyncHandler(restoreRevision));

module.exports = router;
