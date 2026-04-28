'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Aether Logger — Detailed structured logger
//  Every action, every user, every error — kuch bhi nahi chhutha
// ─────────────────────────────────────────────────────────────────────────────

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LEVEL = LEVELS[(process.env.LOG_LEVEL || 'debug').toUpperCase()] ?? LEVELS.DEBUG;

// ANSI colors for local dev readability
const C = {
  reset:   '\x1b[0m',
  dim:     '\x1b[2m',
  bold:    '\x1b[1m',
  red:     '\x1b[31m',
  yellow:  '\x1b[33m',
  green:   '\x1b[32m',
  cyan:    '\x1b[36m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
  white:   '\x1b[37m',
};

const IS_TTY = process.stdout.isTTY;

function colorize(color, text) {
  return IS_TTY ? `${color}${text}${C.reset}` : text;
}

function timestamp() {
  return new Date().toISOString();
}

function levelLabel(level) {
  switch (level) {
    case 'DEBUG': return colorize(C.dim,    '[DEBUG]');
    case 'INFO':  return colorize(C.green,  '[INFO ]');
    case 'WARN':  return colorize(C.yellow, '[WARN ]');
    case 'ERROR': return colorize(C.red,    '[ERROR]');
    default:      return `[${level}]`;
  }
}

function tagLabel(tag) {
  return colorize(C.cyan, `[${tag}]`);
}

function formatExtra(extra) {
  if (!extra || typeof extra !== 'object' || !Object.keys(extra).length) return '';
  return '\n    ' + colorize(C.dim, JSON.stringify(extra, null, 2).replace(/\n/g, '\n    '));
}

function write(level, levelNum, tag, msg, extra) {
  if (levelNum < CURRENT_LEVEL) return;

  const line = `${colorize(C.dim, timestamp())} ${levelLabel(level)} ${tagLabel(tag)} ${msg}${formatExtra(extra)}`;

  if (levelNum >= LEVELS.ERROR) {
    console.error(line);
  } else if (levelNum >= LEVELS.WARN) {
    console.warn(line);
  } else {
    console.log(line);
  }
}

// ── Core log methods ──────────────────────────────────────────────────────────

const logger = {
  debug: (tag, msg, extra) => write('DEBUG', LEVELS.DEBUG, tag, msg, extra),
  info:  (tag, msg, extra) => write('INFO',  LEVELS.INFO,  tag, msg, extra),
  warn:  (tag, msg, extra) => write('WARN',  LEVELS.WARN,  tag, msg, extra),
  error: (tag, msg, extra) => write('ERROR', LEVELS.ERROR, tag, msg, extra),

  // ── Specialized activity loggers ───────────────────────────────────────────

  /**
   * User ne kuch kiya — har action log hoga user info ke saath
   */
  userAction(ctxOrInfo, action, extra = {}) {
    const userId   = ctxOrInfo?.from?.id        || ctxOrInfo?.userId   || '?';
    const username = ctxOrInfo?.from?.username
      ? `@${ctxOrInfo.from.username}`
      : ctxOrInfo?.from?.first_name || 'unknown';
    const chatId   = ctxOrInfo?.chat?.id        || ctxOrInfo?.chatId   || '?';
    write('INFO', LEVELS.INFO, 'User', action, { userId, username, chatId, ...extra });
  },

  /**
   * Download lifecycle — START / SUCCESS / FAIL / CLEANUP
   */
  download(phase, extra = {}) {
    const phaseStr =
      phase === 'SUCCESS' ? colorize(C.green,  'SUCCESS') :
      phase === 'FAIL'    ? colorize(C.red,    'FAIL')    :
      phase === 'START'   ? colorize(C.blue,   'START')   :
      phase === 'CLEANUP' ? colorize(C.dim,    'CLEANUP') :
      phase;
    write('INFO', LEVELS.INFO, 'Download', phaseStr, extra);
  },

  /**
   * Full yt-dlp stderr dump — MOST IMPORTANT for debugging Instagram etc.
   * Logs even empty stderr so we know the command ran
   */
  ytdlpStderr(context, stderr, extra = {}) {
    if (!stderr || !stderr.trim()) {
      write('DEBUG', LEVELS.DEBUG, 'yt-dlp', `[${context}] stderr empty`, extra);
      return;
    }
    write('ERROR', LEVELS.ERROR, 'yt-dlp', `[${context}] full stderr below:`, {
      ...extra,
      stderr: stderr.slice(0, 3000),
    });
  },

  /**
   * yt-dlp args being run — for debugging exactly what command is fired
   */
  ytdlpCmd(context, args) {
    write('DEBUG', LEVELS.DEBUG, 'yt-dlp', `[${context}] command:`, {
      cmd: `yt-dlp ${args.join(' ')}`,
    });
  },

  /**
   * Session store events
   */
  session(event, chatId, extra = {}) {
    write('DEBUG', LEVELS.DEBUG, 'Session', event, { chatId, ...extra });
  },

  /**
   * Rate limit events
   */
  rateLimit(userId, action) {
    write('WARN', LEVELS.WARN, 'RateLimit', action, { userId });
  },

  /**
   * Bot startup summary
   */
  startup(info = {}) {
    console.log('');
    console.log(colorize(C.magenta, '  ╔═══════════════════════════════╗'));
    console.log(colorize(C.magenta, '  ║       Aether Bot v1.0.0       ║'));
    console.log(colorize(C.magenta, '  ╚═══════════════════════════════╝'));
    console.log('');
    for (const [k, v] of Object.entries(info)) {
      console.log(`  ${colorize(C.cyan, k.padEnd(18))} ${v}`);
    }
    console.log('');
  },

  /**
   * Visual separator for log readability
   */
  separator() {
    if (CURRENT_LEVEL <= LEVELS.DEBUG) {
      console.log(colorize(C.dim, '─'.repeat(80)));
    }
  },
};

module.exports = logger;
