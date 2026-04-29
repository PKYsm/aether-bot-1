'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Meta Fetcher — yt-dlp --dump-json wrapper with full error visibility
// ─────────────────────────────────────────────────────────────────────────────

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs   = require('fs');

const execFileAsync = promisify(execFile);

const { YTDLP_BIN, META_FETCH_TIMEOUT_MS, COOKIES_FILE } = require('../../config/constants');
const { MetaFetchTimeoutError, UnsupportedSiteError, parseYtdlpError } = require('./errors');
const logger = require('./logger');

const INSTAGRAM_DOMAINS = ['instagram.com', 'instagr.am'];
const YOUTUBE_DOMAINS   = ['youtube.com', 'youtu.be', 'yt.be', 'music.youtube.com', 'youtube-nocookie.com'];

function matchesDomain(url, domains) {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    return domains.some((d) => host === d || host.endsWith('.' + d));
  } catch { return false; }
}

/**
 * Builds yt-dlp args for metadata fetch
 */
function buildMetaArgs(url) {
  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout', '20',
  ];

  // ── Cookies (Instagram / Facebook private / etc.) ──────────────────────────
  if (COOKIES_FILE && fs.existsSync(COOKIES_FILE)) {
    args.push('--cookies', COOKIES_FILE);
    logger.debug('MetaFetcher', 'Using cookies file', { path: COOKIES_FILE });
  } else if (COOKIES_FILE) {
    logger.warn('MetaFetcher', 'COOKIES_FILE set but file not found!', { path: COOKIES_FILE });
  }

  // ── Instagram specific ─────────────────────────────────────────────────────
  if (matchesDomain(url, INSTAGRAM_DOMAINS)) {
    args.push(
      '--add-headers', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      '--add-headers', 'Accept-Language:en-US,en;q=0.9',
      '--add-headers', 'Accept:*/*',
      '--add-headers', 'Referer:https://www.instagram.com/',
      '--extractor-args', 'instagram:app_id=936619743392459',
    );
    logger.debug('MetaFetcher', 'Instagram mode: headers injected');
  }

  // ── YouTube specific ───────────────────────────────────────────────────────
  if (matchesDomain(url, YOUTUBE_DOMAINS)) {
    args.push('--extractor-args', 'youtube:player_client=web');
    logger.debug('MetaFetcher', 'YouTube mode: web player client');
  }

  args.push(url);
  return args;
}

/**
 * Fetches metadata for a URL via yt-dlp.
 * @param {string} url
 * @returns {Promise<Object>}
 */
async function fetchMeta(url) {
  const args = buildMetaArgs(url);
  logger.ytdlpCmd('fetchMeta', args);

  let stdout = '', stderr = '';
  try {
    ({ stdout, stderr } = await execFileAsync(YTDLP_BIN, args, {
      timeout: META_FETCH_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    }));
  } catch (err) {
    // Always log full stderr — this is the key to debugging
    const rawStderr = err.stderr || err.message || '';
    logger.ytdlpStderr('fetchMeta', rawStderr, { url: url.slice(0, 100) });

    if (err.killed || err.signal === 'SIGTERM') throw new MetaFetchTimeoutError();
    throw parseYtdlpError(rawStderr);
  }

  // Log any stderr even on success (warnings)
  if (stderr && stderr.trim()) {
    logger.debug('MetaFetcher', 'yt-dlp stderr (non-fatal)', { stderr: stderr.slice(0, 500) });
  }

  // Parse JSON
  let info;
  try {
    // yt-dlp sometimes returns multiple JSON objects for playlists — take first
    const firstLine = stdout.split('\n').find((l) => l.trim().startsWith('{'));
    info = JSON.parse(firstLine || stdout);
  } catch (parseErr) {
    logger.error('MetaFetcher', 'JSON parse failed', { stdout: stdout.slice(0, 200), err: parseErr.message });
    throw new UnsupportedSiteError(url);
  }

  const formats = info.formats || [];

  // ── Video qualities ───────────────────────────────────────────────────────
  // Only include actual video streams (not thumbnails/images):
  // - vcodec must exist and not be "none"
  // - height >= 144
  // - fps check: exclude only if fps is explicitly 0 (null/undefined = unknown = allow)
  const rawHeights = formats
    .filter((f) =>
      f.vcodec && f.vcodec !== 'none' &&
      f.height && f.height >= 144 &&
      f.fps !== 0  // 0 = static image/thumbnail; null/undefined = real video stream
    )
    .map((f) => f.height);
  const videoHeights = [...new Set(rawHeights)].sort((a, b) => a - b);

  // ── Audio ─────────────────────────────────────────────────────────────────
  const hasAudio = formats.some((f) => f.acodec && f.acodec !== 'none');

  // ── Size estimate ─────────────────────────────────────────────────────────
  const estimatedSize = formats
    .map((f) => f.filesize || f.filesize_approx || 0)
    .filter(Boolean)
    .sort((a, b) => b - a)[0] || null;

  const result = {
    title:         info.title         || 'Unknown Title',
    thumbnail:     info.thumbnail     || null,
    duration:      info.duration      || null,
    uploader:      info.uploader      || info.channel || null,
    extractor:     info.extractor_key || info.extractor || null,
    webpage_url:   info.webpage_url   || url,
    videoHeights,
    hasAudio,
    estimatedSize,
    isPlaylist:    info._type === 'playlist',
    url,
  };

  logger.info('MetaFetcher', 'Meta fetched successfully', {
    title:      result.title.slice(0, 50),
    extractor:  result.extractor,
    qualities:  videoHeights,
    hasAudio,
    isPlaylist: result.isPlaylist,
  });

  return result;
}

module.exports = { fetchMeta };
