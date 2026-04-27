'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Session Store — In-memory, TTL-based
//  Stores metadata between URL detection and download button press
// ─────────────────────────────────────────────────────────────────────────────

const { SESSION_TTL_MS } = require('../../config/constants');
const logger = require('./logger');

const store = new Map();   // chatId → { meta, expiresAt }
const active = new Set();  // chatIds currently downloading

// ── Session ───────────────────────────────────────────────────────────────────

function setMeta(chatId, meta) {
  store.set(chatId, { meta, expiresAt: Date.now() + SESSION_TTL_MS });
}

function getMeta(chatId) {
  const entry = store.get(chatId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(chatId);
    return null;
  }
  return entry.meta;
}

function deleteMeta(chatId) {
  store.delete(chatId);
}

// ── Active download tracking ──────────────────────────────────────────────────

function setDownloading(chatId) { active.add(chatId); }
function clearDownloading(chatId) { active.delete(chatId); }
function isDownloading(chatId) { return active.has(chatId); }

// ── Cleanup expired sessions every 15 minutes ─────────────────────────────────

setInterval(() => {
  const now = Date.now();
  let purged = 0;
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) { store.delete(key); purged++; }
  }
  if (purged > 0) logger.debug('SessionStore', `Purged ${purged} expired sessions`);
}, 15 * 60 * 1000);

module.exports = { setMeta, getMeta, deleteMeta, setDownloading, clearDownloading, isDownloading };
