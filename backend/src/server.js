// Main backend entry point for PairPad.
// This will initialize Express, Socket.IO, middleware, and routes.

const express = require('express');

const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'pairpad-backend-placeholder' });
});

module.exports = app;
