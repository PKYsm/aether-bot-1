'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Callback Handler — quality button → download → send → follow-up keyboard
// ─────────────────────────────────────────────────────────────────────────────

const { Markup } = require('telegraf');
const session           = require('../utils/sessionStore');
const { download, cleanup } = require('../utils/downloader');
const { applyWatermark }    = require('../utils/watermark');
const { notifyOwner }       = require('../utils/notifier');
const { esc, truncate }     = require('../utils/helpers');
const { safeDelete, disableKeyboard, replyWithError } = require('../utils/tgHelper');
const { ActiveDownloadError } = require('../utils/errors');
const { buildKeyboardRows }   = require('./message');
const logger = require('../utils/logger');

const FOLLOWUP_AUTO_REMOVE_MS = 10_000; // 10 seconds

async function handleCallback(ctx) {
  const data   = ctx.callbackQuery?.data;
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!data || !data.startsWith('dl:')) return;

  await ctx.answerCbQuery();

  // ── Cancel ────────────────────────────────────────────────────────────────
  if (data === 'dl:cancel') {
    session.deleteMeta(chatId);
    session.clearKeyboardMsgId(chatId);
    try { await ctx.deleteMessage(); } catch {}
    return;
  }

  // ── Close follow-up ───────────────────────────────────────────────────────
  if (data === 'dl:close') {
    try { await ctx.deleteMessage(); } catch {}
    return;
  }

  // ── Re-show quality buttons (after follow-up) ─────────────────────────────
  if (data === 'dl:reshow') {
    const meta = session.getMeta(chatId);
    if (!meta) {
      try { await ctx.deleteMessage(); } catch {}
      return ctx.reply('⌛ Session expire ho gaya\\. Link dobara bhejo\\.', { parse_mode: 'MarkdownV2' });
    }
    // Delete follow-up message
    try { await ctx.deleteMessage(); } catch {}

    // Send fresh quality keyboard
    const rows    = buildKeyboardRows(meta);
    const sentMsg = await ctx.reply(
      `📌 *${esc(truncate(meta.title, 60))}*\n\n👇 *Quality select karo:*`,
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(rows) }
    );
    session.setKeyboardMsgId(chatId, sentMsg.message_id);
    return;
  }

  // ── Guard: session expired? ───────────────────────────────────────────────
  const meta = session.getMeta(chatId);
  if (!meta) {
    return ctx.reply('⌛ Session expire ho gaya *(10 min)*\\. Link dobara bhejo\\.', { parse_mode: 'MarkdownV2' });
  }

  // ── Guard: already downloading? ───────────────────────────────────────────
  if (isDownloading(chatId)) return replyWithError(ctx, new ActiveDownloadError());

  // ── Parse action ──────────────────────────────────────────────────────────
  const isAudio = data === 'dl:audio';
  const height  = data.startsWith('dl:video:') ? parseInt(data.split(':')[2], 10) : null;
  const label   = isAudio ? '🎵 Audio (MP3)' : `📹 ${height}p`;

  logger.separator();
  logger.userAction(ctx, `Download: ${label}`, { url: meta.url.slice(0, 80) });

  // ── Delete original thumbnail+keyboard message (point 1) ─────────────────
  try { await ctx.deleteMessage(); } catch {}
  session.clearKeyboardMsgId(chatId);

  // ── Status message ────────────────────────────────────────────────────────
  const statusId = (await ctx.reply(
    `⏳ *Downloading* ${esc(label)}\\.\\.\\.\n📌 ${esc(truncate(meta.title, 50))}\n\n_Kuch waqt lagega\\._`,
    { parse_mode: 'MarkdownV2' }
  )).message_id;

  session.setDownloading(chatId);
  let filePath = null;

  try {
    filePath = await download(meta.url, height, isAudio);

    // ── Apply watermark (video only) ──────────────────────────────────────
    if (!isAudio) {
      filePath = await applyWatermark(filePath);
    }

    // ── Delete status ─────────────────────────────────────────────────────
    await safeDelete(ctx, statusId);

    // ── Send file ─────────────────────────────────────────────────────────
    const caption = `*${esc(truncate(meta.title, 60))}*\n${esc(label)}`;

    if (isAudio) {
      await ctx.replyWithAudio(
        { source: filePath },
        { title: meta.title, performer: meta.uploader || undefined, caption, parse_mode: 'MarkdownV2' }
      );
    } else {
      await ctx.replyWithVideo(
        { source: filePath },
        { caption, parse_mode: 'MarkdownV2' }
      );
    }

    logger.info('CallbackHandler', 'File sent ✅', { label, chatId });
    cleanup(filePath);
    session.deleteMeta(chatId);

    // ── Follow-up keyboard (point 2) — auto-remove after 10s ─────────────
    await sendFollowUp(ctx, chatId);

  } catch (err) {
    await safeDelete(ctx, statusId);
    cleanup(filePath);
    await replyWithError(ctx, err);
    if (!err.code) await notifyOwner(ctx.telegram, { chatId, userId }, `download [${label}]`, err);

  } finally {
    session.clearDownloading(chatId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Follow-up keyboard after successful send
// ─────────────────────────────────────────────────────────────────────────────

async function sendFollowUp(ctx, chatId) {
  try {
    const msg = await ctx.reply(
      '✅ *Done\\!* Aage kya karna hai?',
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🔄 Doosri Quality', 'dl:reshow'),
            Markup.button.callback('❌ Band Karo', 'dl:close'),
          ],
        ]),
      }
    );

    // Auto-remove after 10 seconds
    setTimeout(async () => {
      try { await ctx.telegram.deleteMessage(chatId, msg.message_id); } catch {}
    }, FOLLOWUP_AUTO_REMOVE_MS);

  } catch {}
}

// Shorthand (already tracked in sessionStore but need local ref for guard)
function isDownloading(chatId) { return session.isDownloading(chatId); }

module.exports = { handleCallback };
