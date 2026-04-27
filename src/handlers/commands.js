'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Command Handlers — /start, /help, /platforms, /about
// ─────────────────────────────────────────────────────────────────────────────

const { BOT_NAME, BOT_VERSION, SUPPORTED_PLATFORMS, BLOCKED_PLATFORMS } = require('../../config/constants');
const { esc } = require('../utils/helpers');

// ── /start ────────────────────────────────────────────────────────────────────
async function onStart(ctx) {
  const name = esc(ctx.from?.first_name || 'bhai');
  await ctx.reply(
    `👋 *Namaste, ${name}\\!*\n\n` +
    `Main *Aether* hun — ek fast media downloader bot\\.\n\n` +
    `📌 *Kaise use karein?*\n` +
    `Bas koi bhi supported site ka link bhejo — main automatically detect karke quality options dikhaunga\\.\n\n` +
    `⚡ *Features:*\n` +
    `• Auto link detection\n` +
    `• Video quality select \\(360p → 1080p\\+\\)\n` +
    `• Audio\\-only MP3 download\n` +
    `• Title, thumbnail, duration preview\n\n` +
    `📋 /platforms — Supported sites dekhne ke liye\n` +
    `❓ /help — Help ke liye`,
    { parse_mode: 'MarkdownV2' }
  );
}

// ── /help ─────────────────────────────────────────────────────────────────────
async function onHelp(ctx) {
  await ctx.reply(
    `❓ *Aether — Help*\n\n` +
    `*Step 1:* Koi bhi supported site ka link bhejo\n` +
    `*Step 2:* Main thumbnail \\+ title \\+ available qualities dikhaunga\n` +
    `*Step 3:* Quality button press karo\n` +
    `*Step 4:* File seedha Telegram pe mil jayegi ✅\n\n` +
    `─────────────────────\n` +
    `📦 *File size limit:* 50 MB \\(Telegram limit\\)\n` +
    `⏱ *Session timeout:* 10 minutes\n` +
    `🚦 *Rate limit:* 4 requests per minute\n` +
    `─────────────────────\n` +
    `❌ *Kaam nahi karta:*\n` +
    `• YouTube, Instagram \\(blocked\\)\n` +
    `• Private / login\\-required videos\n` +
    `• DRM\\-protected content\n` +
    `• 50MB+ files\n\n` +
    `/platforms — Supported sites ki list`,
    { parse_mode: 'MarkdownV2' }
  );
}

// ── /platforms ────────────────────────────────────────────────────────────────
async function onPlatforms(ctx) {
  const supportedLines = SUPPORTED_PLATFORMS
    .map((p) => `${p.emoji} *${esc(p.name)}* — \`${esc(p.domain)}\``)
    .join('\n');

  const blockedLines = BLOCKED_PLATFORMS
    .map((p) => `${p.emoji} ~~${esc(p.name)}~~`)
    .join('  ');

  await ctx.reply(
    `📋 *Supported Platforms*\n\n` +
    `${supportedLines}\n\n` +
    `─────────────────────\n` +
    `❌ *Blocked:* ${blockedLines}\n\n` +
    `_yt\\-dlp support karta hai 1000\\+ sites — agar koi link kaam na kare toh try karke dekho\\!_`,
    { parse_mode: 'MarkdownV2' }
  );
}

// ── /about ────────────────────────────────────────────────────────────────────
async function onAbout(ctx) {
  await ctx.reply(
    `✨ *${esc(BOT_NAME)} v${esc(BOT_VERSION)}*\n\n` +
    `A fast, clean Telegram media downloader\\.\n\n` +
    `🔧 *Tech Stack:*\n` +
    `• Node\\.js \\+ Telegraf\n` +
    `• yt\\-dlp \\(download engine\\)\n` +
    `• ffmpeg \\(format merging\\)\n` +
    `• Hosted on Render`,
    { parse_mode: 'MarkdownV2' }
  );
}

module.exports = { onStart, onHelp, onPlatforms, onAbout };
