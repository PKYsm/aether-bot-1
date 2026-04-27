'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Callback Handler — processes quality button presses, downloads, sends file
// ─────────────────────────────────────────────────────────────────────────────

const { getMeta, deleteMeta, isDownloading, setDownloading, clearDownloading } = require('../utils/sessionStore');
const { download, cleanup } = require('../utils/downloader');
const { notifyOwner }       = require('../utils/notifier');
const { esc, truncate }     = require('../utils/helpers');
const { safeDelete, disableKeyboard, replyWithError } = require('../utils/tgHelper');
const { ActiveDownloadError } = require('../utils/errors');
const logger = require('../utils/logger');

async function handleCallback(ctx) {
  const data   = ctx.callbackQuery?.data;
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;

  if (!data || !data.startsWith('dl:')) return;

  await ctx.answerCbQuery(); // dismiss spinner immediately

  // ── Cancel ───────────────────────────────────────────────────────────────
  if (data === 'dl:cancel') {
    deleteMeta(chatId);
    try { await ctx.deleteMessage(); } catch {}
    return;
  }

  // ── Guard: session expired? ───────────────────────────────────────────────
  const meta = getMeta(chatId);
  if (!meta) {
    return ctx.reply(
      '⌛ Session expire ho gaya *(10 min timeout)*\\.\n\nLink dobara bhejo\\.',
      { parse_mode: 'MarkdownV2' }
    );
  }

  // ── Guard: already downloading? ───────────────────────────────────────────
  if (isDownloading(chatId)) {
    return replyWithError(ctx, new ActiveDownloadError());
  }

  // ── Parse action ─────────────────────────────────────────────────────────
  const isAudio  = data === 'dl:audio';
  const height   = data.startsWith('dl:video:') ? parseInt(data.split(':')[2], 10) : null;
  const label    = isAudio ? '🎵 Audio (MP3)' : `📹 ${height}p`;

  logger.info('CallbackHandler', `Download requested`, { label, chatId, url: meta.url.slice(0, 60) });

  // ── Disable keyboard (prevent double-clicks) ─────────────────────────────
  await disableKeyboard(ctx);

  // ── Status message ────────────────────────────────────────────────────────
  const statusId = await sendStatus(ctx,
    `⏳ *Downloading* ${esc(label)}\\.\\.\\.\n📌 ${esc(truncate(meta.title, 50))}\n\n_Yeh kuch waqt le sakta hai\\._`
  );

  // ── Mark as active ────────────────────────────────────────────────────────
  setDownloading(chatId);
  let filePath = null;

  try {
    filePath = await download(meta.url, height, isAudio);

    // ── Delete status ──────────────────────────────────────────────────────
    await safeDelete(ctx, statusId);

    // ── Send file ──────────────────────────────────────────────────────────
    const caption = `*${esc(truncate(meta.title, 60))}*\n${esc(label)}`;

    if (isAudio) {
      await ctx.replyWithAudio(
        { source: filePath },
        {
          title:     meta.title,
          performer: meta.uploader || undefined,
          caption,
          parse_mode: 'MarkdownV2',
        }
      );
    } else {
      await ctx.replyWithVideo(
        { source: filePath },
        { caption, parse_mode: 'MarkdownV2' }
      );
    }

    logger.info('CallbackHandler', `File sent`, { label, chatId });

    // ── Cleanup ────────────────────────────────────────────────────────────
    cleanup(filePath);
    deleteMeta(chatId);

  } catch (err) {
    await safeDelete(ctx, statusId);
    cleanup(filePath);
    await replyWithError(ctx, err);

    // Notify owner only for unexpected errors
    if (!err.code) {
      await notifyOwner(ctx.telegram, { chatId, userId }, `download [${label}]`, err);
    }

  } finally {
    clearDownloading(chatId);
  }
}

// ── Local helper ─────────────────────────────────────────────────────────────
async function sendStatus(ctx, text) {
  const msg = await ctx.reply(text, { parse_mode: 'MarkdownV2' });
  return msg.message_id;
}

module.exports = { handleCallback };
