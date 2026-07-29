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

if (!process.env.JWT_SECRET) {
  console.error(
    '[PairPad Backend] JWT_SECRET is not set. Refusing to start without a signing secret.'
  );
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

app.use(cors(corsOptions));

// Parse JSON bodies
app.use(express.json({ limit: '1mb' })); // Limit body size

// Health check route (no rate limiting)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'pairpad-backend' });
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

startServer();

module.exports = app;
