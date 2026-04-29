'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Message Handler — detects URLs, fetches meta, shows quality keyboard
// ─────────────────────────────────────────────────────────────────────────────

const { Markup } = require('telegraf');

const { extractUrl, normalizeUrl, getBlockedPlatform, detectPlatform } = require('../utils/urlParser');
const { fetchMeta }      = require('../utils/metaFetcher');
const { setMeta }        = require('../utils/sessionStore');
const { checkRateLimit } = require('../middleware/rateLimit');
const { notifyOwner }    = require('../utils/notifier');
const { esc, formatDuration, formatSize, truncate } = require('../utils/helpers');
const { safeDelete, replyWithError } = require('../utils/tgHelper');
const { BlockedPlatformError } = require('../utils/errors');
const logger = require('../utils/logger');

async function handleMessage(ctx) {
  const text = ctx.message?.text;
  if (!text) return;

  const rawUrl = extractUrl(text);
  if (!rawUrl) return;

  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  // ── Rate limit ──────────────────────────────────────────────────────────
  try {
    checkRateLimit(userId);
  } catch (err) {
    return replyWithError(ctx, err);
  }

  // ── Blocked platform check ───────────────────────────────────────────────
  const blocked = getBlockedPlatform(rawUrl);
  if (blocked) {
    return replyWithError(ctx, new BlockedPlatformError(blocked.name));
  }

  // ── Normalize URL ────────────────────────────────────────────────────────
  const url = normalizeUrl(rawUrl);
  const platform = detectPlatform(url);

  logger.separator();
  logger.userAction(ctx, 'Link received', { url: url.slice(0, 100), platform: platform.name });

  // ── Show loading state ───────────────────────────────────────────────────
  const loadingMsg = await ctx.reply(
    `${platform.emoji} *${esc(platform.name)}* link detect hua\\!\n🔍 Metadata fetch ho raha hai\\.\\.\\.`,
    { parse_mode: 'MarkdownV2' }
  );

  // ── Fetch metadata ───────────────────────────────────────────────────────
  let meta;
  try {
    meta = await fetchMeta(url);
  } catch (err) {
    await safeDelete(ctx, loadingMsg.message_id);
    await replyWithError(ctx, err);
    // Only notify owner for unexpected errors
    if (!err.code) await notifyOwner(ctx.telegram, { chatId, userId }, 'fetchMeta', err);
    return;
  }

  // ── Playlist warning ─────────────────────────────────────────────────────
  if (meta.isPlaylist) {
    await safeDelete(ctx, loadingMsg.message_id);
    return ctx.reply(
      '📋 Yeh link ek *playlist* ka hai\\.\n\nAbhi sirf single videos support hain\\. Direct video link bhejo\\.',
      { parse_mode: 'MarkdownV2' }
    );
  }

  // ── No formats warning ───────────────────────────────────────────────────
  if (!meta.videoHeights.length && !meta.hasAudio) {
    await safeDelete(ctx, loadingMsg.message_id);
    return ctx.reply(
      '🚫 Koi downloadable format nahi mila\\.\nShayad yeh content DRM\\-protected ya live stream hai\\.',
      { parse_mode: 'MarkdownV2' }
    );
  }

  // ── Save meta to session ─────────────────────────────────────────────────
  setMeta(chatId, meta);

  // ── Build quality keyboard ───────────────────────────────────────────────
  const rows = [];

  if (meta.videoHeights.length > 0) {
    // Highest quality first (descending)
    const videoButtons = [...meta.videoHeights]
      .reverse()
      .map((h) => Markup.button.callback(`📹 ${h}p`, `dl:video:${h}`));

    // Max 3 buttons per row
    for (let i = 0; i < videoButtons.length; i += 3) {
      rows.push(videoButtons.slice(i, i + 3));
    }
  }

  if (meta.hasAudio) {
    rows.push([Markup.button.callback('🎵 Audio Only (MP3)', 'dl:audio')]);
  }

  rows.push([Markup.button.callback('❌ Cancel', 'dl:cancel')]);

  // ── Build caption ────────────────────────────────────────────────────────
  const titleLine    = `📌 *${esc(truncate(meta.title, 80))}*`;
  const platformLine = `${platform.emoji} ${esc(platform.name)}`;
  const uploaderLine = meta.uploader ? `👤 ${esc(truncate(meta.uploader, 40))}` : null;
  const durationLine = meta.duration ? `⏱ ${esc(formatDuration(meta.duration))}` : null;
  const sizeLine     = meta.estimatedSize ? `💾 \\~${esc(formatSize(meta.estimatedSize))}` : null;
  const qualLine     = meta.videoHeights.length
    ? `📊 ${meta.videoHeights.map((h) => `${h}p`).join(' • ')}`
    : null;

  const caption = [
    titleLine,
    '',
    [platformLine, uploaderLine].filter(Boolean).join('  '),
    [durationLine, sizeLine].filter(Boolean).join('  '),
    qualLine,
    '',
    '👇 *Quality select karo:*',
  ]
    .filter((l) => l !== null)
    .join('\n');

  // ── Delete loading + send result ─────────────────────────────────────────
  await safeDelete(ctx, loadingMsg.message_id);

  const keyboard = Markup.inlineKeyboard(rows);

  try {
    if (meta.thumbnail) {
      await ctx.replyWithPhoto(meta.thumbnail, {
        caption,
        parse_mode: 'MarkdownV2',
        ...keyboard,
      });
    } else {
      await ctx.reply(caption, { parse_mode: 'MarkdownV2', ...keyboard });
    }
  } catch {
    // Thumbnail might be unavailable — fallback to text
    await ctx.reply(caption, { parse_mode: 'MarkdownV2', ...keyboard });
  }
}

module.exports = { handleMessage };
