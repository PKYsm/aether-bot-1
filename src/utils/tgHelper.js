'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Telegram Helpers — safe wrappers around Telegraf APIs
// ─────────────────────────────────────────────────────────────────────────────

const { AetherError } = require('./errors');
const { esc } = require('./helpers');
const logger = require('./logger');

/**
 * Deletes a message, ignoring any errors (already deleted, permissions, etc.)
 */
async function safeDelete(ctx, messageId) {
  try {
    await ctx.deleteMessage(messageId);
  } catch {}
}

/**
 * Edits a message text, ignoring errors
 */
async function safeEdit(ctx, messageId, text, extra = {}) {
  try {
    await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, text, {
      parse_mode: 'MarkdownV2',
      ...extra,
    });
  } catch {}
}

/**
 * Removes inline keyboard from a message (disables buttons while processing)
 */
async function disableKeyboard(ctx) {
  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch {}
}

/**
 * Sends a user-friendly error reply.
 * Uses AetherError.userMessage if available, else generic message.
 * @param {import('telegraf').Context} ctx
 * @param {Error} err
 */
async function replyWithError(ctx, err) {
  let msg;

  if (err instanceof AetherError) {
    msg = err.userMessage;
  } else {
    logger.error('TgHelper', 'Unhandled non-AetherError', { err: err.message });
    msg = '❌ Kuch galat ho gaya\\. Thodi der baad dobara try karo\\.';
  }

  try {
    await ctx.reply(msg, { parse_mode: 'MarkdownV2' });
  } catch {
    // Fallback to plain text if MarkdownV2 fails
    try {
      await ctx.reply(msg.replace(/\\/g, ''));
    } catch {}
  }
}

/**
 * Sends a "thinking..." status message and returns its id for later deletion.
 */
async function sendStatus(ctx, text) {
  const msg = await ctx.reply(esc(text), { parse_mode: 'MarkdownV2' });
  return msg.message_id;
}

module.exports = { safeDelete, safeEdit, disableKeyboard, replyWithError, sendStatus };
