'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  Typed errors — makes error handling clean & explicit
// ─────────────────────────────────────────────────────────────────────────────

class AetherError extends Error {
  constructor(message, userMessage, code) {
    super(message);
    this.name = 'AetherError';
    this.userMessage = userMessage; // shown to Telegram user
    this.code = code;
  }
}

class BlockedPlatformError extends AetherError {
  constructor(platformName) {
    super(
      `Blocked platform: ${platformName}`,
      `❌ *${platformName}* is bot mein support nahi hai.\n\nDusre platforms ke liye /platforms dekho.`,
      'BLOCKED_PLATFORM'
    );
  }
}

class UnsupportedSiteError extends AetherError {
  constructor(host) {
    super(
      `Unsupported site: ${host}`,
      `❌ Yeh site yt-dlp support nahi karta.\n\nSupported platforms ke liye /platforms dekho.`,
      'UNSUPPORTED_SITE'
    );
  }
}

class PrivateVideoError extends AetherError {
  constructor() {
    super(
      'Private or login-required video',
      `🔒 Yeh video *private* hai ya login chahiye.\n\nSirf public content download ho sakta hai.`,
      'PRIVATE_VIDEO'
    );
  }
}

class GeoRestrictedError extends AetherError {
  constructor() {
    super(
      'Geo-restricted content',
      `🌍 Yeh content *geo-restricted* hai — is region mein available nahi.`,
      'GEO_RESTRICTED'
    );
  }
}

class FileTooLargeError extends AetherError {
  constructor(sizeStr) {
    super(
      `File too large: ${sizeStr}`,
      `📦 File bahut badi hai *(${sizeStr})*.\n\nTelegram sirf *50 MB* tak allow karta hai. Koi chhoti quality try karo.`,
      'FILE_TOO_LARGE'
    );
  }
}

class MetaFetchTimeoutError extends AetherError {
  constructor() {
    super(
      'Metadata fetch timed out',
      `⏱️ Metadata fetch mein bahut time lag gaya.\n\nSite slow ho sakti hai — thodi der baad try karo.`,
      'META_TIMEOUT'
    );
  }
}

class DownloadTimeoutError extends AetherError {
  constructor() {
    super(
      'Download timed out',
      `⏱️ Download bahut slow hai ya hang ho gaya.\n\nChhoti quality try karo ya baad mein try karo.`,
      'DOWNLOAD_TIMEOUT'
    );
  }
}

class NoFormatsError extends AetherError {
  constructor() {
    super(
      'No downloadable formats found',
      `🚫 Koi downloadable format nahi mila.\n\nShayad yeh content DRM-protected ya live stream hai.`,
      'NO_FORMATS'
    );
  }
}

class InstagramLoginError extends AetherError {
  constructor() {
    super(
      'Instagram requires login/cookies',
      `📸 *Instagram* ne yeh content serve karne se mana kar diya\\.\n\n` +
      `Public reels ke liye cookies setup karni padegi\\. Bot owner se contact karo\\.`,
      'INSTAGRAM_LOGIN'
    );
  }
}
class RateLimitError extends AetherError {
  constructor(waitSecs) {
    super(
      'Rate limit exceeded',
      `🚦 Thoda slow lo! Zyada requests aa rahi hain.\n\n*${waitSecs} seconds* mein dobara try karo.`,
      'RATE_LIMIT'
    );
  }
}

class ActiveDownloadError extends AetherError {
  constructor() {
    super(
      'Already downloading for this user',
      `⚙️ Tera download pehle se chal raha hai!\n\nWait karo, complete hone do phir naya download karo.`,
      'ACTIVE_DOWNLOAD'
    );
  }
}

/**
 * Parses raw yt-dlp stderr to return a typed AetherError.
 * @param {string} stderr
 * @returns {AetherError}
 */
function parseYtdlpError(stderr) {
  const s = stderr.toLowerCase();

  if (s.includes('private video') || s.includes('login required') || s.includes('sign in'))
    return new PrivateVideoError();

  if (s.includes('instagram') && (s.includes('login') || s.includes('checkpoint') || s.includes('cookies') || s.includes('challenge') || s.includes('401') || s.includes('not available')))
    return new InstagramLoginError();

  if (s.includes('geo') || s.includes('not available in your country') || s.includes('region'))
    return new GeoRestrictedError();

  if (s.includes('no video formats') || s.includes('no formats') || s.includes('drm'))
    return new NoFormatsError();

  if (s.includes('unsupported url') || s.includes('is not a valid url'))
    return new UnsupportedSiteError('this site');

  // Generic fallback
  return new AetherError(
    stderr,
    `❌ Download fail ho gaya.\n\nShayad yeh content available nahi ya site mein koi issue hai.`,
    'YTDLP_ERROR'
  );
}

module.exports = {
  AetherError,
  BlockedPlatformError,
  UnsupportedSiteError,
  PrivateVideoError,
  GeoRestrictedError,
  FileTooLargeError,
  MetaFetchTimeoutError,
  DownloadTimeoutError,
  NoFormatsError,
  RateLimitError,
  ActiveDownloadError,
  InstagramLoginError,
  parseYtdlpError,
};
