'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Simple structured logger (no external deps)
// ─────────────────────────────────────────────────────────────────────────────

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT = LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LEVELS.INFO;

function ts() {
  return new Date().toISOString();
}

function fmt(level, tag, msg, extra) {
  const base = `[${ts()}] [${level}] [${tag}] ${msg}`;
  return extra ? `${base} ${JSON.stringify(extra)}` : base;
}

const logger = {
  debug: (tag, msg, extra) => {
    if (CURRENT <= LEVELS.DEBUG) console.debug(fmt('DEBUG', tag, msg, extra));
  },
  info: (tag, msg, extra) => {
    if (CURRENT <= LEVELS.INFO) console.info(fmt('INFO ', tag, msg, extra));
  },
  warn: (tag, msg, extra) => {
    if (CURRENT <= LEVELS.WARN) console.warn(fmt('WARN ', tag, msg, extra));
  },
  error: (tag, msg, extra) => {
    if (CURRENT <= LEVELS.ERROR) console.error(fmt('ERROR', tag, msg, extra));
  },
};

module.exports = logger;
