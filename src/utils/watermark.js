'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Watermark — ffmpeg se video pe transparent PNG overlay
// ─────────────────────────────────────────────────────────────────────────────

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs   = require('fs');

const execFileAsync = promisify(execFile);
const logger = require('./logger');

// Watermark config
const WATERMARK_PATH = process.env.WATERMARK_FILE
  ? path.resolve(process.cwd(), process.env.WATERMARK_FILE)
  : path.resolve(process.cwd(), 'assets/watermark.png');

const WATERMARK_SIZE = parseInt(process.env.WATERMARK_SIZE || '120', 10); // px width
const WATERMARK_POS  = process.env.WATERMARK_POS || 'topright'; // topright | topleft | bottomright | bottomleft
const WATERMARK_PAD  = 12; // px from edge

/**
 * Returns ffmpeg overlay expression based on position
 */
function overlayExpr(pos) {
  switch (pos) {
    case 'topleft':     return `${WATERMARK_PAD}:${WATERMARK_PAD}`;
    case 'bottomright': return `W-w-${WATERMARK_PAD}:H-h-${WATERMARK_PAD}`;
    case 'bottomleft':  return `${WATERMARK_PAD}:H-h-${WATERMARK_PAD}`;
    case 'topright':
    default:            return `W-w-${WATERMARK_PAD}:${WATERMARK_PAD}`;
  }
}

/**
 * Returns true if watermark is configured and file exists
 */
function isWatermarkEnabled() {
  return fs.existsSync(WATERMARK_PATH);
}

/**
 * Applies watermark to a video file using ffmpeg.
 * Input file is deleted, returns path to new watermarked file.
 *
 * @param {string} inputPath — Path to downloaded mp4
 * @returns {Promise<string>} — Path to watermarked mp4
 */
async function applyWatermark(inputPath) {
  if (!isWatermarkEnabled()) {
    logger.debug('Watermark', 'Skipped — no watermark file found', { expected: WATERMARK_PATH });
    return inputPath;
  }

  const dir      = path.dirname(inputPath);
  const ext      = path.extname(inputPath);
  const base     = path.basename(inputPath, ext);
  const outputPath = path.join(dir, `${base}_wm${ext}`);

  const overlay = overlayExpr(WATERMARK_POS);

  // ffmpeg filter:
  // [1]scale=W:-1[wm]  → resize watermark to WATERMARK_SIZE wide, keep aspect
  // [0][wm]overlay=... → overlay on video at position
  const filterComplex = `[1]scale=${WATERMARK_SIZE}:-1[wm];[0][wm]overlay=${overlay}`;

  logger.debug('Watermark', 'Applying', { pos: WATERMARK_POS, size: WATERMARK_SIZE, overlay });

  try {
    await execFileAsync('ffmpeg', [
      '-i', inputPath,
      '-i', WATERMARK_PATH,
      '-filter_complex', filterComplex,
      '-codec:a', 'copy',          // don't re-encode audio
      '-preset', 'fast',
      '-y',                         // overwrite output if exists
      outputPath,
    ], { timeout: 3 * 60 * 1000 }); // 3 min max

    // Delete original, return watermarked
    try { fs.unlinkSync(inputPath); } catch {}
    logger.debug('Watermark', 'Applied successfully', { output: path.basename(outputPath) });
    return outputPath;

  } catch (err) {
    logger.error('Watermark', 'ffmpeg failed — sending without watermark', { err: err.message });
    // Cleanup failed output if it exists
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
    return inputPath; // fallback: send without watermark
  }
}

module.exports = { applyWatermark, isWatermarkEnabled, WATERMARK_PATH };
