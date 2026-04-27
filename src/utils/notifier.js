'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Owner Notifier — DMs errors to bot owner silently
// ─────────────────────────────────────────────────────────────────────────────

const logger = require('./logger');

/**
 * Sends an error report to the bot owner via DM.
 * Never throws — failure is logged and swallowed.
 *
 * @param {import('telegraf').Telegraf} telegram - Telegram instance
 * @param {{ chatId?: string|number, userId?: string|number }} ctx - context info
 * @param {string} label - Short description of where the error happened
 * @param {Error|string} err - The error
 */
async function notifyOwner(telegram, { chatId, userId } = {}, label, err) {
  const ownerId = process.env.OWNER_ID;
  if (!ownerId) return;

  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error && err.stack ? err.stack.split('\n').slice(0, 5).join('\n') : '';

  const text = [
    `⚠️ *Aether Error Report*`,
    ``,
    `📍 *Where:* \`${label}\``,
    chatId  ? `💬 *Chat:* \`${chatId}\``   : null,
    userId  ? `👤 *User:* \`${userId}\``   : null,
    ``,
    `❌ *Error:*`,
    `\`\`\``,
    msg.slice(0, 800),
    stack ? stack.slice(0, 400) : null,
    `\`\`\``,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    await telegram.sendMessage(ownerId, text, { parse_mode: 'Markdown' });
  } catch (dmErr) {
    logger.error('Notifier', 'Failed to DM owner', { dmErr: dmErr.message });
  }
}

module.exports = { notifyOwner };
