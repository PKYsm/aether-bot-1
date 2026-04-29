'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Aether Bot — Central Configuration
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Bot identity
  BOT_NAME: 'Aether',
  BOT_VERSION: '1.0.0',

  // Limits
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024,   // 50 MB — Telegram hard limit
  SESSION_TTL_MS: 10 * 60 * 1000,           // 10 minutes
  META_FETCH_TIMEOUT_MS: 35_000,            // 35 seconds
  DOWNLOAD_TIMEOUT_MS: 5 * 60 * 1000,      // 5 minutes

  // Rate limiting
  RATE_LIMIT_MAX: 4,            // max requests per window
  RATE_LIMIT_WINDOW_MS: 60_000, // per 1 minute

  // Temp dir (Render has ephemeral FS — perfect for temp files)
  TEMP_DIR: 'temp',

  // yt-dlp binary name (must be in PATH)
  YTDLP_BIN: 'yt-dlp',

  // Optional cookies.txt path — supports both relative & absolute paths
  // yt-dlp tries to write back to cookies file — so we copy it to writable temp/ dir
  // Local:  COOKIES_FILE=etc/secrets/cookies.txt
  // Render: COOKIES_FILE=/etc/secrets/cookies.txt  (read-only, so we copy to temp/)
  COOKIES_FILE: (() => {
    if (!process.env.COOKIES_FILE) return null;
    const path = require('path');
    const fs   = require('fs');
    const src  = path.resolve(process.cwd(), process.env.COOKIES_FILE);
    if (!fs.existsSync(src)) return src; // will warn later in metaFetcher/downloader
    // Copy to writable location so yt-dlp can update it
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const dest = path.join(tempDir, 'cookies.txt');
    fs.copyFileSync(src, dest);
    return dest;
  })(),

  // Platforms explicitly blocked
  BLOCKED_PLATFORMS: [],

  // Platforms with known yt-dlp support (for /platforms command display)
  SUPPORTED_PLATFORMS: [
    { name: 'YouTube',       emoji: '🔴', domain: 'youtube.com / youtu.be' },
    { name: 'Instagram',     emoji: '📸', domain: 'instagram.com' },
    { name: 'Twitter / X',   emoji: '🐦', domain: 'twitter.com / x.com' },
    { name: 'TikTok',        emoji: '🎵', domain: 'tiktok.com' },
    { name: 'Reddit',        emoji: '🤖', domain: 'reddit.com' },
    { name: 'Facebook',      emoji: '📘', domain: 'facebook.com' },
    { name: 'Vimeo',         emoji: '🎬', domain: 'vimeo.com' },
    { name: 'Dailymotion',   emoji: '📹', domain: 'dailymotion.com' },
    { name: 'Twitch Clips',  emoji: '🟣', domain: 'clips.twitch.tv' },
    { name: 'SoundCloud',    emoji: '🎧', domain: 'soundcloud.com' },
    { name: 'Bilibili',      emoji: '📺', domain: 'bilibili.com' },
    { name: 'Streamable',    emoji: '▶️', domain: 'streamable.com' },
    { name: 'Pinterest',     emoji: '📌', domain: 'pinterest.com' },
    { name: 'Tumblr',        emoji: '📓', domain: 'tumblr.com' },
    { name: '+ 1000 more',   emoji: '✨', domain: 'via yt-dlp' },
  ],
};
