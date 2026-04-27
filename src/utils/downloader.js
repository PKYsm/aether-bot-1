'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Downloader — yt-dlp wrapper with quality control & cleanup
// ─────────────────────────────────────────────────────────────────────────────

const { spawn } = require('child_process');
const path  = require('path');
const fs    = require('fs');

const { YTDLP_BIN, TEMP_DIR, MAX_FILE_SIZE_BYTES, DOWNLOAD_TIMEOUT_MS, COOKIES_FILE } = require('../../config/constants');

const INSTAGRAM_HEADERS = [
  'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language: en-US,en;q=0.9',
  'Accept: */*',
  'Referer: https://www.instagram.com/',
];

function isInstagram(url) {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    return host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am';
  } catch { return false; }
}
const { FileTooLargeError, DownloadTimeoutError, parseYtdlpError } = require('./errors');
const { formatSize } = require('./helpers');
const logger = require('./logger');

// Ensure temp dir exists
const TEMP_PATH = path.join(process.cwd(), TEMP_DIR);
if (!fs.existsSync(TEMP_PATH)) fs.mkdirSync(TEMP_PATH, { recursive: true });

/**
 * Downloads a URL via yt-dlp.
 *
 * @param {string}       url       — Media URL
 * @param {number|null}  height    — Max video height (null = best available)
 * @param {boolean}      audioOnly — Extract as MP3
 * @returns {Promise<string>}        Path to downloaded file
 * @throws {AetherError}
 */
function download(url, height, audioOnly = false) {
  return new Promise((resolve, reject) => {
    const fileId   = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const outTpl   = path.join(TEMP_PATH, `${fileId}.%(ext)s`);

    // ── Build yt-dlp args ─────────────────────────────────────────────────
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--socket-timeout', '20',
      '-o', outTpl,
    ];

    // Cookies file (Instagram private, Facebook, etc.)
    if (COOKIES_FILE) {
      args.push('--cookies', COOKIES_FILE);
    }

    // Instagram-specific headers to bypass login wall for public content
    if (isInstagram(url)) {
      for (const header of INSTAGRAM_HEADERS) {
        args.push('--add-headers', header);
      }
      args.push('--extractor-args', 'instagram:app_id=936619743392459');
    }

    if (audioOnly) {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else if (height) {
      // Best video <= requested height merged with best audio → mp4
      args.push(
        '-f',
        `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`,
        '--merge-output-format', 'mp4'
      );
    } else {
      args.push('-f', 'bestvideo+bestaudio/best', '--merge-output-format', 'mp4');
    }

    args.push(url);

    logger.info('Downloader', `Starting download`, { fileId, height, audioOnly });

    const proc  = spawn(YTDLP_BIN, args);
    let stderr  = '';
    let settled = false;

    // Collect stderr for error parsing
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    // Timeout
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill('SIGKILL');
        reject(new DownloadTimeoutError());
      }
    }, DOWNLOAD_TIMEOUT_MS);

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(parseYtdlpError(err.message));
    });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) return reject(parseYtdlpError(stderr));

      // Find the written file
      let files;
      try {
        files = fs.readdirSync(TEMP_PATH).filter((f) => f.startsWith(fileId));
      } catch (e) {
        return reject(parseYtdlpError('Could not read temp dir'));
      }

      if (!files.length) return reject(parseYtdlpError('File not found after download'));

      const filePath = path.join(TEMP_PATH, files[0]);
      const size = fs.statSync(filePath).size;

      logger.info('Downloader', `Download complete`, { file: files[0], size: formatSize(size) });

      if (size > MAX_FILE_SIZE_BYTES) {
        cleanup(filePath);
        return reject(new FileTooLargeError(formatSize(size)));
      }

      resolve(filePath);
    });
  });
}

/**
 * Safely deletes a temp file (ignores errors)
 * @param {string|null} filePath
 */
function cleanup(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

module.exports = { download, cleanup };
