'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Session Store — TTL sessions + URL meta cache + keyboard msg tracking
// ─────────────────────────────────────────────────────────────────────────────

const { SESSION_TTL_MS } = require('../../config/constants');
const logger = require('./logger');

// ── Per-user session (meta + keyboardMsgId) ───────────────────────────────────
const sessions = new Map(); // chatId → { meta, keyboardMsgId, expiresAt }

// ── URL metadata cache (avoid re-fetching same URL) ───────────────────────────
const urlCache = new Map(); // url → { meta, expiresAt }
const URL_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ── Active downloads ──────────────────────────────────────────────────────────
const active = new Set();

// ─────────────────────────────────────────────────────────────────────────────
//  Session
// ─────────────────────────────────────────────────────────────────────────────

function setMeta(chatId, meta) {
  const existing = sessions.get(chatId) || {};
  sessions.set(chatId, { ...existing, meta, expiresAt: Date.now() + SESSION_TTL_MS });
  logger.session('SET_META', chatId, { title: meta.title?.slice(0, 40) });
}

function getMeta(chatId) {
  const entry = sessions.get(chatId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { sessions.delete(chatId); return null; }
  return entry.meta;
}

function deleteMeta(chatId) {
  sessions.delete(chatId);
  logger.session('DELETE', chatId);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Keyboard message tracking (to delete old keyboard before sending new)
// ─────────────────────────────────────────────────────────────────────────────

function setKeyboardMsgId(chatId, msgId) {
  const entry = sessions.get(chatId) || { expiresAt: Date.now() + SESSION_TTL_MS };
  sessions.set(chatId, { ...entry, keyboardMsgId: msgId });
}

function getKeyboardMsgId(chatId) {
  return sessions.get(chatId)?.keyboardMsgId || null;
}

function clearKeyboardMsgId(chatId) {
  const entry = sessions.get(chatId);
  if (entry) { delete entry.keyboardMsgId; sessions.set(chatId, entry); }
}

// ─────────────────────────────────────────────────────────────────────────────
//  URL Metadata Cache
// ─────────────────────────────────────────────────────────────────────────────

function cacheUrl(url, meta) {
  urlCache.set(url, { meta, expiresAt: Date.now() + URL_CACHE_TTL });
  logger.debug('URLCache', 'Cached', { url: url.slice(0, 60) });
}

function getCachedUrl(url) {
  const entry = urlCache.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { urlCache.delete(url); return null; }
  logger.debug('URLCache', 'Cache HIT', { url: url.slice(0, 60) });
  return entry.meta;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Active download tracking
// ─────────────────────────────────────────────────────────────────────────────

function setDownloading(chatId)   { active.add(chatId); }
function clearDownloading(chatId) { active.delete(chatId); }
function isDownloading(chatId)    { return active.has(chatId); }

// ─────────────────────────────────────────────────────────────────────────────
//  Cleanup — every 15 min
// ─────────────────────────────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  let purged = 0;
  for (const [k, v] of sessions.entries()) { if (now > v.expiresAt) { sessions.delete(k); purged++; } }
  for (const [k, v] of urlCache.entries()) { if (now > v.expiresAt) { urlCache.delete(k); purged++; } }
  if (purged) logger.debug('SessionStore', `Purged ${purged} expired entries`);
}, 15 * 60 * 1000);

module.exports = {
  setMeta, getMeta, deleteMeta,
  setKeyboardMsgId, getKeyboardMsgId, clearKeyboardMsgId,
  cacheUrl, getCachedUrl,
  setDownloading, clearDownloading, isDownloading,
};
