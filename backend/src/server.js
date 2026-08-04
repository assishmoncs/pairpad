// Main backend entry point for PairPad.
// Initializes Express, applies middleware, mounts routes, starts the HTTP server,
// and sets up Socket.IO.

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
const messageRoutes = require('./routes/messageRoutes');
const executeRoutes = require('./routes/executeRoutes');
const initializeSocket = require('./sockets/socketHandler');
const { apiLimiter, authLimiter, executeLimiter } = require('./middleware/rateLimiter');
const {
  requestLogger,
  notFoundMiddleware,
  errorHandler,
} = require('./middleware/errorHandler');

if (!process.env.JWT_SECRET) {
  logger.error('JWT_SECRET is not set. Refusing to start without a signing secret.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;
// Comma-separated list of allowed browser origins
const ALLOWED_ORIGINS = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser clients (no Origin header) and explicitly allowed origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
};

// Security headers with Helmet.
// CSP is enabled for production-grade hardening. `connect-src` allows self plus
// the Socket.IO endpoint; dev-tools/WebSockets are covered by 'self' and 'ws:'.
app.use(
  helmet({
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
  })
);

app.use(cors(corsOptions));
app.use(requestLogger);

// Parse JSON bodies
app.use(express.json({ limit: '1mb' })); // Limit body size

// Liveness probe — the process is up.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'pairpad-backend', uptime: process.uptime() });
});

// Readiness probe — the process can serve traffic (DB reachable).
app.get('/ready', async (_req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  if (dbState === 1) {
    return res.json({ status: 'ready', db: 'connected' });
  }
  res.status(503).json({ status: 'not_ready', db: 'disconnected' });
});

// General API rate limiter must run before the routes it protects
app.use('/api', apiLimiter);

// Mount API routes with endpoint-specific rate limiting
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/execute', executeLimiter, executeRoutes);

// 404 handler for undefined routes
app.use(notFoundMiddleware);

// Global error handler (must be last)
app.use(errorHandler);

// Create HTTP server from Express app
const server = http.createServer(app);

// Handle server listen errors (e.g. EADDRINUSE)
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use by another process. Please free port ${PORT} or update PORT in .env.`);
  } else {
    logger.error('Server error', { message: error.message });
  }
  process.exit(1);
});

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
});

// Store io instance for access in routes
app.set('io', io);

// Attach Socket.IO handler
initializeSocket(io);

// Connect to MongoDB and start server
async function startServer() {
  try {
    await connectDB();

    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Health endpoint: http://localhost:${PORT}/health`);
      logger.info(`Readiness endpoint: http://localhost:${PORT}/ready`);
      logger.info(`API routes: /api/auth/*, /api/rooms/*, /api/messages/*`);
      logger.info('Socket.IO ready for real-time collaboration');
    });
  } catch (error) {
    logger.error('Failed to start server', { message: error.message });
    process.exit(1);
  }
}

// Graceful shutdown handling
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

  // Force-exit if graceful close hangs.
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

// Expose a close helper for integration tests.
app.close = (cb) => {
  if (io) io.close();
  server.close(cb);
};

// Start the server (connects to MongoDB first). Integration tests only require
// this module after confirming MongoDB is reachable, mirroring the original
// behaviour.
startServer();

module.exports = app;
