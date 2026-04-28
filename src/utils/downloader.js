'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Downloader — yt-dlp wrapper with full logging & typed errors
// ─────────────────────────────────────────────────────────────────────────────

const { spawn } = require('child_process');
const path = require('path');
const fs   = require('fs');

const { YTDLP_BIN, TEMP_DIR, MAX_FILE_SIZE_BYTES, DOWNLOAD_TIMEOUT_MS, COOKIES_FILE } = require('../../config/constants');
const { FileTooLargeError, DownloadTimeoutError, parseYtdlpError } = require('./errors');
const { formatSize } = require('./helpers');
const logger = require('./logger');

const TEMP_PATH = path.join(process.cwd(), TEMP_DIR);
if (!fs.existsSync(TEMP_PATH)) fs.mkdirSync(TEMP_PATH, { recursive: true });

const INSTAGRAM_DOMAINS = ['instagram.com', 'instagr.am'];
const YOUTUBE_DOMAINS   = ['youtube.com', 'youtu.be', 'yt.be', 'music.youtube.com', 'youtube-nocookie.com'];

function matchesDomain(url, domains) {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    return domains.some((d) => host === d || host.endsWith('.' + d));
  } catch { return false; }
}

/**
 * Downloads a URL via yt-dlp.
 * @param {string}      url
 * @param {number|null} height    — Max video height; null = best
 * @param {boolean}     audioOnly — Extract as MP3
 * @returns {Promise<string>} Path to downloaded file
 */
function download(url, height, audioOnly = false) {
  return new Promise((resolve, reject) => {
    const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const outTpl = path.join(TEMP_PATH, `${fileId}.%(ext)s`);

    // ── Build args ────────────────────────────────────────────────────────
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--socket-timeout', '20',
      '-o', outTpl,
    ];

    // Cookies
    if (COOKIES_FILE && fs.existsSync(COOKIES_FILE)) {
      args.push('--cookies', COOKIES_FILE);
      logger.debug('Downloader', 'Using cookies file', { path: COOKIES_FILE });
    } else if (COOKIES_FILE) {
      logger.warn('Downloader', 'COOKIES_FILE set but file not found', { path: COOKIES_FILE });
    }

    // Instagram headers
    if (matchesDomain(url, INSTAGRAM_DOMAINS)) {
      args.push(
        '--add-headers', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        '--add-headers', 'Accept-Language:en-US,en;q=0.9',
        '--add-headers', 'Accept:*/*',
        '--add-headers', 'Referer:https://www.instagram.com/',
        '--extractor-args', 'instagram:app_id=936619743392459',
      );
      logger.debug('Downloader', 'Instagram mode: headers injected');
    }

    // YouTube player client
    if (matchesDomain(url, YOUTUBE_DOMAINS)) {
      args.push('--extractor-args', 'youtube:player_client=web');
    }

    // Quality / format
    if (audioOnly) {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else if (height) {
      args.push(
        '-f',
        `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`,
        '--merge-output-format', 'mp4',
      );
    } else {
      args.push('-f', 'bestvideo+bestaudio/best', '--merge-output-format', 'mp4');
    }

    args.push(url);

    logger.ytdlpCmd('download', args);
    logger.download('START', { fileId, height, audioOnly, url: url.slice(0, 80) });

    const proc = spawn(YTDLP_BIN, args);
    let stderr  = '';
    let stdout  = '';
    let settled = false;

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => {
      const chunk = d.toString();
      stderr += chunk;
      // Live stderr lines in debug mode so we can watch progress
      chunk.split('\n').forEach((line) => {
        if (line.trim()) logger.debug('yt-dlp:live', line.trim());
      });
    });

    // Timeout
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGKILL');
      logger.download('FAIL', { fileId, reason: 'TIMEOUT' });
      reject(new DownloadTimeoutError());
    }, DOWNLOAD_TIMEOUT_MS);

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      logger.ytdlpStderr('download:spawn', err.message, { fileId });
      reject(parseYtdlpError(err.message));
    });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      // Always dump stderr on non-zero exit
      if (code !== 0) {
        logger.ytdlpStderr('download:exit', stderr, { fileId, code, url: url.slice(0, 100) });
        return reject(parseYtdlpError(stderr));
      }

      // Warn if any stderr even on success
      if (stderr.trim()) {
        logger.warn('Downloader', 'Non-fatal stderr on success', { stderr: stderr.slice(0, 300) });
      }

      // Find downloaded file
      let files;
      try {
        files = fs.readdirSync(TEMP_PATH).filter((f) => f.startsWith(fileId));
      } catch (e) {
        return reject(parseYtdlpError(`Could not read temp dir: ${e.message}`));
      }

      if (!files.length) {
        logger.error('Downloader', 'File not found after download', { fileId, stdout: stdout.slice(0, 200) });
        return reject(parseYtdlpError('File not found after download'));
      }

      const filePath = path.join(TEMP_PATH, files[0]);
      const size = fs.statSync(filePath).size;
      const sizeStr = formatSize(size);

      if (size > MAX_FILE_SIZE_BYTES) {
        cleanup(filePath);
        logger.download('FAIL', { fileId, reason: 'SIZE_EXCEEDED', size: sizeStr });
        return reject(new FileTooLargeError(sizeStr));
      }

      logger.download('SUCCESS', { fileId, file: files[0], size: sizeStr });
      resolve(filePath);
    });
  });
}

/**
 * Safely deletes a temp file
 */
function cleanup(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.download('CLEANUP', { file: path.basename(filePath) });
    }
  } catch (e) {
    logger.warn('Downloader', 'Cleanup failed', { filePath, err: e.message });
  }
}

module.exports = { download, cleanup };
