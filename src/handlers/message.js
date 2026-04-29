'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Message Handler — URL detect → meta fetch (cached) → quality keyboard
// ─────────────────────────────────────────────────────────────────────────────

const { Markup } = require('telegraf');

const { extractUrl, normalizeUrl, getBlockedPlatform, detectPlatform } = require('../utils/urlParser');
const { fetchMeta }      = require('../utils/metaFetcher');
const session            = require('../utils/sessionStore');
const { checkRateLimit } = require('../middleware/rateLimit');
const { notifyOwner }    = require('../utils/notifier');
const { esc, formatDuration, formatSize, truncate } = require('../utils/helpers');
const { safeDelete, replyWithError } = require('../utils/tgHelper');
const { BlockedPlatformError } = require('../utils/errors');
const logger = require('../utils/logger');

const AUTO_REMOVE_MS = 2 * 60 * 1000; // 2 minutes — remove keyboard if no selection

async function handleMessage(ctx) {
  const text = ctx.message?.text;
  if (!text) return;

  const rawUrl = extractUrl(text);
  if (!rawUrl) return;

  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  // ── Rate limit ────────────────────────────────────────────────────────────
  try { checkRateLimit(userId); }
  catch (err) { return replyWithError(ctx, err); }

  // ── Blocked platform ──────────────────────────────────────────────────────
  const blocked = getBlockedPlatform(rawUrl);
  if (blocked) return replyWithError(ctx, new BlockedPlatformError(blocked.name));

  // ── Normalize ─────────────────────────────────────────────────────────────
  const url      = normalizeUrl(rawUrl);
  const platform = detectPlatform(url);

  logger.separator();
  logger.userAction(ctx, 'Link received', { url: url.slice(0, 100), platform: platform.name });

  // ── Delete old keyboard if exists (point 3) ───────────────────────────────
  const oldMsgId = session.getKeyboardMsgId(chatId);
  if (oldMsgId) {
    try { await ctx.telegram.deleteMessage(chatId, oldMsgId); } catch {}
    session.clearKeyboardMsgId(chatId);
    logger.debug('MessageHandler', 'Deleted old keyboard message', { msgId: oldMsgId });
  }

  // ── Loading message ───────────────────────────────────────────────────────
  const loadingMsg = await ctx.reply(
    `${platform.emoji} *${esc(platform.name)}* link detect hua\\!\n🔍 Metadata fetch ho raha hai\\.\\.\\.`,
    { parse_mode: 'MarkdownV2' }
  );

  // ── Fetch metadata (check cache first) ───────────────────────────────────
  let meta = session.getCachedUrl(url);
  let fromCache = !!meta;

  if (!meta) {
    try {
      meta = await fetchMeta(url);
      session.cacheUrl(url, meta); // cache for 30 min
    } catch (err) {
      await safeDelete(ctx, loadingMsg.message_id);
      await replyWithError(ctx, err);
      if (!err.code) await notifyOwner(ctx.telegram, { chatId, userId }, 'fetchMeta', err);
      return;
    }
  } else {
    logger.info('MessageHandler', 'Meta served from cache ⚡');
  }

  // ── Playlist / no formats guard ───────────────────────────────────────────
  if (meta.isPlaylist) {
    await safeDelete(ctx, loadingMsg.message_id);
    return ctx.reply('📋 Yeh link ek *playlist* ka hai\\.\n\nDirect video link bhejo\\.', { parse_mode: 'MarkdownV2' });
  }
  if (!meta.videoHeights.length && !meta.hasAudio) {
    await safeDelete(ctx, loadingMsg.message_id);
    return ctx.reply('🚫 Koi downloadable format nahi mila\\.', { parse_mode: 'MarkdownV2' });
  }

  // ── Save meta to session ──────────────────────────────────────────────────
  session.setMeta(chatId, meta);

  // ── Build keyboard ────────────────────────────────────────────────────────
  const rows = buildKeyboardRows(meta);

  // ── Build caption ─────────────────────────────────────────────────────────
  const caption = buildCaption(meta, platform, fromCache);

  // ── Delete loading + send result ──────────────────────────────────────────
  await safeDelete(ctx, loadingMsg.message_id);

  const keyboard = Markup.inlineKeyboard(rows);
  let sentMsg;
  try {
    if (meta.thumbnail) {
      sentMsg = await ctx.replyWithPhoto(meta.thumbnail, { caption, parse_mode: 'MarkdownV2', ...keyboard });
    } else {
      sentMsg = await ctx.reply(caption, { parse_mode: 'MarkdownV2', ...keyboard });
    }
  } catch {
    sentMsg = await ctx.reply(caption, { parse_mode: 'MarkdownV2', ...keyboard });
  }

  // ── Track keyboard message (point 3) ─────────────────────────────────────
  session.setKeyboardMsgId(chatId, sentMsg.message_id);

  // ── Auto-remove keyboard after 2 min if no selection (point 4) ───────────
  setTimeout(async () => {
    const currentMsgId = session.getKeyboardMsgId(chatId);
    if (currentMsgId !== sentMsg.message_id) return; // user already acted
    try {
      await ctx.telegram.editMessageReplyMarkup(chatId, sentMsg.message_id, null, { inline_keyboard: [] });
      await ctx.telegram.sendMessage(
        chatId,
        '⏰ Buttons hata diye gaye\\. /continue likhkar wapas quality select karo\\.',
        { parse_mode: 'MarkdownV2' }
      );
    } catch {}
    session.clearKeyboardMsgId(chatId);
    logger.debug('MessageHandler', 'Auto-removed keyboard after 2 min', { chatId });
  }, AUTO_REMOVE_MS);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildKeyboardRows(meta) {
  const rows = [];

  if (meta.videoHeights.length > 0) {
    const btns = [...meta.videoHeights]
      .reverse()
      .map((h) => Markup.button.callback(`📹 ${h}p`, `dl:video:${h}`));
    for (let i = 0; i < btns.length; i += 3) rows.push(btns.slice(i, i + 3));
  }

  if (meta.hasAudio) {
    rows.push([Markup.button.callback('🎵 Audio Only (MP3)', 'dl:audio')]);
  }

  rows.push([Markup.button.callback('❌ Cancel', 'dl:cancel')]);
  return rows;
}

function buildCaption(meta, platform, fromCache) {
  const titleLine    = `📌 *${esc(truncate(meta.title, 80))}*`;
  const platformLine = `${platform.emoji} ${esc(platform.name)}`;
  const uploaderLine = meta.uploader ? `👤 ${esc(truncate(meta.uploader, 40))}` : null;
  const durationLine = meta.duration ? `⏱ ${esc(formatDuration(meta.duration))}` : null;
  const sizeLine     = meta.estimatedSize ? `💾 \\~${esc(formatSize(meta.estimatedSize))}` : null;
  const qualLine     = meta.videoHeights.length
    ? `📊 ${meta.videoHeights.map((h) => `${h}p`).join(' • ')}`
    : null;
  const cacheTag     = fromCache ? ` ⚡` : '';

  return [
    titleLine,
    '',
    [platformLine, uploaderLine].filter(Boolean).join('  '),
    [durationLine, sizeLine].filter(Boolean).join('  '),
    qualLine,
    '',
    `👇 *Quality select karo:*${cacheTag}`,
  ].filter((l) => l !== null).join('\n');
}

module.exports = { handleMessage, buildKeyboardRows };
