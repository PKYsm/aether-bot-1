'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  URL Parser — extract, normalize, detect platform
// ─────────────────────────────────────────────────────────────────────────────

const { BLOCKED_PLATFORMS, SUPPORTED_PLATFORMS } = require('../../config/constants');

const URL_REGEX =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;

// Tracking / junk query params to strip for cleaner URLs
const JUNK_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'ref', 'referrer', 'si', // Spotify/TikTok share id
];

/**
 * Extracts the first valid-looking URL from a message.
 * @param {string} text
 * @returns {string|null}
 */
function extractUrl(text) {
  const matches = text.match(URL_REGEX);
  return matches ? matches[0] : null;
}

/**
 * Strips junk tracking params, normalises protocol.
 * @param {string} raw
 * @returns {string}
 */
function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    JUNK_PARAMS.forEach((p) => u.searchParams.delete(p));
    // Force https
    u.protocol = 'https:';
    return u.toString();
  } catch {
    return raw;
  }
}

/**
 * Returns a clean hostname (no www.)
 * @param {string} url
 * @returns {string}
 */
function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Checks if a URL belongs to a blocked platform.
 * Returns the blocked platform object or null.
 * @param {string} url
 * @returns {{ name: string, emoji: string }|null}
 */
function getBlockedPlatform(url) {
  const host = getHostname(url);
  for (const platform of BLOCKED_PLATFORMS) {
    if (platform.domains.some((d) => host === d || host.endsWith('.' + d))) {
      return platform;
    }
  }
  return null;
}

/**
 * Tries to guess a friendly platform name + emoji from the URL.
 * Falls back to the hostname.
 * @param {string} url
 * @returns {{ name: string, emoji: string }}
 */
function detectPlatform(url) {
  const host = getHostname(url);

  // Check supported list first
  for (const p of SUPPORTED_PLATFORMS) {
    const domains = p.domain.split(' / ');
    if (domains.some((d) => host === d || host.endsWith('.' + d))) {
      return { name: p.name, emoji: p.emoji };
    }
  }

  // Common overrides not in SUPPORTED_PLATFORMS
  const overrides = {
    'x.com': { name: 'Twitter / X', emoji: '🐦' },
    'vm.tiktok.com': { name: 'TikTok', emoji: '🎵' },
    'vt.tiktok.com': { name: 'TikTok', emoji: '🎵' },
    'redd.it': { name: 'Reddit', emoji: '🤖' },
    'clips.twitch.tv': { name: 'Twitch Clip', emoji: '🟣' },
    'fb.com': { name: 'Facebook', emoji: '📘' },
    'fb.watch': { name: 'Facebook', emoji: '📘' },
    'youtu.be': { name: 'YouTube', emoji: '🔴' },
    'youtube-nocookie.com': { name: 'YouTube', emoji: '🔴' },
    'music.youtube.com': { name: 'YouTube Music', emoji: '🎵' },
    'yt.be': { name: 'YouTube', emoji: '🔴' },
    'instagr.am': { name: 'Instagram', emoji: '📸' },
  };

  for (const [key, val] of Object.entries(overrides)) {
    if (host === key || host.endsWith('.' + key)) return val;
  }

  // Fallback — use hostname as name
  return { name: host, emoji: '🌐' };
}

module.exports = { extractUrl, normalizeUrl, getHostname, getBlockedPlatform, detectPlatform };
