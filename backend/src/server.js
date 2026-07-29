// Main backend entry point for PairPad.
// Initializes Express, applies middleware, mounts routes, starts HTTP server, and sets up Socket.IO.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');
const messageRoutes = require('./routes/messageRoutes');
const executeRoutes = require('./routes/executeRoutes');
const initializeSocket = require('./sockets/socketHandler');
const { apiLimiter, authLimiter, executeLimiter } = require('./middleware/rateLimiter');
const { notFoundMiddleware, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Apply CORS (allow frontend origin)
app.use(cors({ origin: CLIENT_URL, credentials: true }));

// Parse JSON bodies
app.use(express.json({ limit: '1mb' })); // Limit body size

// Health check route (no rate limiting)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'pairpad-backend' });
});

// Mount API routes with rate limiting
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/execute', executeLimiter, executeRoutes);

// Apply general API rate limiter to remaining routes
app.use('/api', apiLimiter);

// 404 handler for undefined routes
app.use(notFoundMiddleware);

// Global error handler (must be last)
app.use(errorHandler);

// Create HTTP server from Express app
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
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
      console.log(`[PairPad Backend] Server running on port ${PORT}`);
      console.log(`[PairPad Backend] Health endpoint: http://localhost:${PORT}/health`);
      console.log(`[PairPad Backend] API routes: /api/auth/*, /api/rooms/*, /api/messages/*`);
      console.log(`[PairPad Backend] Socket.IO ready for real-time collaboration`);
    });
  } catch (error) {
    console.error('[PairPad Backend] Failed to start server:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('[PairPad Backend] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[PairPad Backend] Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  console.error('[PairPad Backend] Uncaught exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.stack || reason.message : reason;
  console.error('[PairPad Backend] Unhandled promise rejection:', message);
  process.exit(1);
});

startServer();

module.exports = app;
