require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');
const revisionRoutes = require('./routes/revisionRoutes');
const interviewRoutes = require('./routes/interviewRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');
const messageRoutes = require('./routes/messageRoutes');
const executeRoutes = require('./routes/executeRoutes');
const openApiRoutes = require('./routes/openApiRoutes');
const initializeSocket = require('./sockets/socketHandlerDistributed');
const { initializeCrdtSocket } = require('./sockets/crdtSocketHandler');
const { configureSocketScaling, isSocketScalingEnabled } = require('./services/socketScaling');
const { isRedisReady } = require('./services/redisService');
const { apiLimiter, authLimiter, executeLimiter } = require('./middleware/rateLimiter');
const { requestLogger, notFoundMiddleware, errorHandler } = require('./middleware/errorHandler');

if (!process.env.JWT_SECRET) {
  logger.error('JWT_SECRET is not set. Refusing to start without a signing secret.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;
const ALLOWED_ORIGINS = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
};

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(cors(corsOptions));
app.use(requestLogger);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'pairpad-backend', uptime: process.uptime(), scaling: isSocketScalingEnabled() ? 'redis' : 'single-node' });
});

app.get('/ready', async (_req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  const redisRequired = process.env.REDIS_REQUIRED === 'true';
  const redisConnected = isRedisReady();
  if (dbConnected && (!redisRequired || redisConnected)) {
    return res.json({ status: 'ready', db: 'connected', redis: redisConnected ? 'connected' : 'not_configured' });
  }
  return res.status(503).json({ status: 'not_ready', db: dbConnected ? 'connected' : 'disconnected', redis: redisConnected ? 'connected' : 'disconnected' });
});

app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/rooms', revisionRoutes);
app.use('/api/rooms', interviewRoutes);
app.use('/api/rooms', workspaceRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/execute', executeLimiter, executeRoutes);
app.use('/api', openApiRoutes);
app.use(notFoundMiddleware);
app.use(errorHandler);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ALLOWED_ORIGINS, credentials: true } });
app.set('io', io);

initializeSocket(io);
initializeCrdtSocket(io);

async function startServer() {
  try {
    await connectDB();
    await configureSocketScaling(io);
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Health endpoint: http://localhost:${PORT}/health`);
      logger.info(`Readiness endpoint: http://localhost:${PORT}/ready`);
      logger.info(`API contract: http://localhost:${PORT}/api/openapi.yaml`);
      logger.info(`API docs: http://localhost:${PORT}/api/docs`);
      logger.info(`Socket.IO mode: ${isSocketScalingEnabled() ? 'Redis multi-instance' : 'single-node fallback'}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { message: error.message });
    process.exit(1);
  }
}

let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down gracefully...`);
  io.close(() => {
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { stack: error.stack });
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.stack || reason.message : reason;
  logger.error('Unhandled promise rejection', { message });
  shutdown('unhandledRejection');
});

app.close = (cb) => {
  io.close();
  server.close(cb);
};

startServer();
module.exports = app;
