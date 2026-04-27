'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Health Server — Express app for Render keep-alive & monitoring
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const { BOT_NAME, BOT_VERSION } = require('../config/constants');
const logger = require('./utils/logger');

const app  = express();
const PORT = process.env.PORT || 3000;

const startedAt = new Date();

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /  — Simple alive check (for Render's port scanner)
app.get('/', (_req, res) => {
  res.send(`${BOT_NAME} is alive 🚀`);
});

// GET /health  — JSON status (use this as your Render health check URL)
app.get('/health', (_req, res) => {
  const uptimeSecs = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  res.json({
    status:  'ok',
    bot:     BOT_NAME,
    version: BOT_VERSION,
    uptime:  `${uptimeSecs}s`,
    startedAt: startedAt.toISOString(),
    timestamp: new Date().toISOString(),
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

function startServer() {
  app.listen(PORT, () => {
    logger.info('HealthServer', `Running on port ${PORT} — /health for status`);
  });
}

module.exports = { startServer };
