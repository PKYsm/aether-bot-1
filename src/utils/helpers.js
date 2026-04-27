'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats seconds → human readable duration
 * @param {number} sec
 * @returns {string}  e.g. "3:04" or "1:02:45"
 */
function formatDuration(sec) {
  if (!sec || sec < 0) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/**
 * Formats bytes → readable size
 * @param {number} bytes
 * @returns {string}  e.g. "24.5 MB"
 */
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return null;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/**
 * Escapes all MarkdownV2 special characters
 * @param {string} text
 * @returns {string}
 */
function esc(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

/**
 * Truncates a string to maxLen, appending ellipsis if needed
 */
function truncate(str, maxLen = 60) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

function pad(n) { return String(n).padStart(2, '0'); }

module.exports = { formatDuration, formatSize, esc, truncate };
