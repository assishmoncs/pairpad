// MongoDB connection configuration using Mongoose.

const mongoose = require('mongoose');
const logger = require('../utils/logger');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pairpad';

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection failed', { message: error.message });
    throw error;
  }
}

module.exports = connectDB;
