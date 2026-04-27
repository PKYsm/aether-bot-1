'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Rate Limiter Middleware — prevents spam per user
// ─────────────────────────────────────────────────────────────────────────────

const { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } = require('../../config/constants');
const { RateLimitError } = require('../utils/errors');
const logger = require('../utils/logger');

// Map<userId, { count, windowStart }>
const buckets = new Map();

/**
 * Checks and increments the rate limit for a user.
 * @param {number|string} userId
 * @throws {RateLimitError} if limit exceeded
 */
function checkRateLimit(userId) {
  const now = Date.now();
  const bucket = buckets.get(userId);

  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    // New window
    buckets.set(userId, { count: 1, windowStart: now });
    return;
  }

  if (bucket.count >= RATE_LIMIT_MAX) {
    const waitSecs = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - bucket.windowStart)) / 1000);
    logger.warn('RateLimit', `User ${userId} hit rate limit`);
    throw new RateLimitError(waitSecs);
  }

  bucket.count++;
}

// Cleanup stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [uid, b] of buckets.entries()) {
    if (now - b.windowStart >= RATE_LIMIT_WINDOW_MS) buckets.delete(uid);
  }
}, 5 * 60 * 1000);

module.exports = { checkRateLimit };
