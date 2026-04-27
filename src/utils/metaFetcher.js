'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Meta Fetcher — runs yt-dlp --dump-json, parses formats
// ─────────────────────────────────────────────────────────────────────────────

const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const { YTDLP_BIN, META_FETCH_TIMEOUT_MS, COOKIES_FILE } = require('../../config/constants');

// Instagram requires specific headers to avoid login wall
const INSTAGRAM_HEADERS = [
  'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language: en-US,en;q=0.9',
  'Accept: */*',
  'Referer: https://www.instagram.com/',
];

/**
 * Returns true if URL is an Instagram link
 */
function isInstagram(url) {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    return host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am';
  } catch { return false; }
}

/**
 * Builds yt-dlp args array with platform-specific options
 */
function buildMetaArgs(url) {
  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout', '15',
  ];

  // Cookies file (works for all platforms — Instagram, Facebook private, etc.)
  if (COOKIES_FILE) {
    args.push('--cookies', COOKIES_FILE);
  }

  // Instagram-specific: inject headers to bypass login wall for public content
  if (isInstagram(url)) {
    for (const header of INSTAGRAM_HEADERS) {
      args.push('--add-headers', header);
    }
    // Try to extract without login first; yt-dlp handles public reels fine with headers
    args.push('--extractor-args', 'instagram:app_id=936619743392459');
  }

  args.push(url);
  return args;
}
const { MetaFetchTimeoutError, UnsupportedSiteError, parseYtdlpError } = require('./errors');
const logger = require('./logger');

/**
 * Fetches metadata for a URL via yt-dlp.
 * @param {string} url
 * @returns {Promise<Object>}
 */
async function fetchMeta(url) {
  logger.info('MetaFetcher', `Fetching meta for: ${url}`);

  let stdout, stderr;
  try {
    ({ stdout, stderr } = await execFileAsync(
      YTDLP_BIN,
      buildMetaArgs(url),
      { timeout: META_FETCH_TIMEOUT_MS }
    ));
  } catch (err) {
    if (err.killed || err.code === 'ETIMEDOUT') throw new MetaFetchTimeoutError();
    if (err.stderr) throw parseYtdlpError(err.stderr);
    throw parseYtdlpError(err.message);
  }

  // Parse JSON
  let info;
  try {
    info = JSON.parse(stdout);
  } catch {
    throw new UnsupportedSiteError(url);
  }

  const formats = info.formats || [];

  // ── Video qualities ───────────────────────────────────────────────────────
  // Collect unique heights where at least some video codec exists
  const rawHeights = formats
    .filter((f) => f.vcodec && f.vcodec !== 'none' && f.height && f.height >= 144)
    .map((f) => f.height);

  const videoHeights = [...new Set(rawHeights)].sort((a, b) => a - b);

  // ── Audio availability ────────────────────────────────────────────────────
  const hasAudio = formats.some((f) => f.acodec && f.acodec !== 'none');

  // ── Best size estimate ────────────────────────────────────────────────────
  const bestSized = formats
    .map((f) => f.filesize || f.filesize_approx || 0)
    .filter(Boolean)
    .sort((a, b) => b - a);
  const estimatedSize = bestSized[0] || null;

  // ── Is playlist? ─────────────────────────────────────────────────────────
  const isPlaylist = info._type === 'playlist';

  logger.info('MetaFetcher', `Got meta`, {
    title: info.title?.slice(0, 40),
    qualities: videoHeights,
    hasAudio,
    isPlaylist,
  });

  return {
    title:         info.title          || 'Unknown Title',
    thumbnail:     info.thumbnail      || null,
    duration:      info.duration       || null,       // seconds
    uploader:      info.uploader       || info.channel || null,
    extractor:     info.extractor_key  || info.extractor || null,
    webpage_url:   info.webpage_url    || url,
    videoHeights,                                     // e.g. [360, 720, 1080]
    hasAudio,
    estimatedSize,
    isPlaylist,
    url,
  };
}

module.exports = { fetchMeta };
