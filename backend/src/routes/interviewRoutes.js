const express = require('express');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const {
  getInterview,
  configureInterview,
  startInterview,
  pauseInterview,
  resumeInterview,
  endInterview,
  submit,
} = require('../controllers/interviewController');

const router = express.Router();
router.use(authMiddleware);
router.get('/:roomCode/interview', asyncHandler(getInterview));
router.put('/:roomCode/interview', asyncHandler(configureInterview));
router.post('/:roomCode/interview/start', asyncHandler(startInterview));
router.post('/:roomCode/interview/pause', asyncHandler(pauseInterview));
router.post('/:roomCode/interview/resume', asyncHandler(resumeInterview));
router.post('/:roomCode/interview/end', asyncHandler(endInterview));
router.post('/:roomCode/interview/submit', asyncHandler(submit));

module.exports = router;
