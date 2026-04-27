'use strict';

require('dotenv').config();

const { Telegraf } = require('telegraf');
const logger = require('./utils/logger');
const { onStart, onHelp, onPlatforms, onAbout } = require('./handlers/commands');
const { handleMessage } = require('./handlers/message');
const { handleCallback } = require('./handlers/callback');
const { BOT_NAME, BOT_VERSION } = require('../config/constants');
const { startServer } = require('./server');

// ── Validate environment ─────────────────────────────────────────────────────
if (!process.env.BOT_TOKEN) {
  logger.error('Startup', 'BOT_TOKEN is not set. Check your .env file.');
  process.exit(1);
}

if (!process.env.OWNER_ID) {
  logger.warn('Startup', 'OWNER_ID not set — owner error notifications disabled.');
}

// ── Create bot ───────────────────────────────────────────────────────────────
const bot = new Telegraf(process.env.BOT_TOKEN);

// ── Global error handler ─────────────────────────────────────────────────────
bot.catch((err, ctx) => {
  logger.error('BotGlobal', `Unhandled error for update ${ctx.updateType}`, { err: err.message });
});

// ── Commands ──────────────────────────────────────────────────────────────────
bot.start(onStart);
bot.help(onHelp);
bot.command('platforms', onPlatforms);
bot.command('about', onAbout);

// ── Message & Callback handlers ───────────────────────────────────────────────
bot.on('text', handleMessage);
bot.on('callback_query', handleCallback);

// ── Unknown commands ──────────────────────────────────────────────────────────
bot.on('message', (ctx) => {
  // Only respond to non-text messages (photos, stickers, etc.)
  if (ctx.message?.text) return; // already handled by 'text'
  ctx.reply(
    '📎 Sirf *text links* support hain\\.\nKoi bhi supported site ka link bhejo\\.', 
    { parse_mode: 'MarkdownV2' }
  );
});

// ── Launch ────────────────────────────────────────────────────────────────────

// Start Express health server (required for Render Web Service port binding)
startServer();

bot.launch()
  .then(() => {
    logger.info('Startup', `${BOT_NAME} v${BOT_VERSION} is running ✅`);
  })
  .catch((err) => {
    logger.error('Startup', 'Failed to launch bot', { err: err.message });
    process.exit(1);
  });

// Graceful shutdown
process.once('SIGINT',  () => { logger.info('Shutdown', 'SIGINT received'); bot.stop('SIGINT'); });
process.once('SIGTERM', () => { logger.info('Shutdown', 'SIGTERM received'); bot.stop('SIGTERM'); });
