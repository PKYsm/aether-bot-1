# ✨ Aether Bot

> Fast, clean Telegram media downloader with quality selection.

## Features

| Feature | Detail |
|---|---|
| 🔗 Auto link detection | Regex-based URL extraction from any message |
| 🌐 Platform detection | Shows platform name + emoji (Twitter, TikTok, Reddit, etc.) |
| 📊 Quality selection | All available qualities from 144p to 4K via inline keyboard |
| 🎵 Audio-only | MP3 extraction at best quality |
| 🖼️ Preview | Thumbnail + title + duration + estimated size |
| ❌ Blocklist | YouTube & Instagram blocked (per config) |
| 🚦 Rate limiting | 4 requests/min per user |
| ⚙️ Download guard | Prevents concurrent downloads per user |
| ⏱️ Session TTL | 10-minute session expiry |
| 📦 Size check | Rejects files > 50 MB before sending |
| 🔔 Owner DMs | All unexpected errors DM'd to owner silently |
| 🗂️ Typed errors | 10+ specific error types with friendly user messages |

## Commands

| Command | Description |
|---|---|
| `/start` | Welcome message |
| `/help` | Usage guide |
| `/platforms` | List of supported platforms |
| `/about` | Bot info |

## Project Structure

```
aether-bot/
├── config/
│   └── constants.js        ← All config in one place
├── src/
│   ├── index.js            ← Entry point + bot setup
│   ├── handlers/
│   │   ├── commands.js     ← /start /help /platforms /about
│   │   ├── message.js      ← URL detect → meta fetch → keyboard
│   │   └── callback.js     ← Button press → download → send
│   ├── middleware/
│   │   └── rateLimit.js    ← Per-user rate limiter
│   └── utils/
│       ├── urlParser.js    ← Extract, normalize, detect platform
│       ├── metaFetcher.js  ← yt-dlp --dump-json wrapper
│       ├── downloader.js   ← yt-dlp download + cleanup
│       ├── sessionStore.js ← TTL session + active download tracking
│       ├── errors.js       ← Typed error classes + yt-dlp error parser
│       ├── helpers.js      ← Duration, size, markdown formatting
│       ├── tgHelper.js     ← Safe Telegram API wrappers
│       ├── notifier.js     ← Owner DM notifications
│       └── logger.js       ← Structured console logger
├── .env.example
├── .gitignore
├── package.json
└── render.yaml
```

## Local Setup

```bash
# 1. Clone & install
npm install

# 2. Install yt-dlp + ffmpeg
pip install yt-dlp
# macOS:  brew install ffmpeg
# Ubuntu: sudo apt install ffmpeg

# 3. Setup env
cp .env.example .env
# Fill BOT_TOKEN and OWNER_ID

# 4. Run
npm run dev
```

## Deploy to Render

1. Push repo to GitHub
2. Render → **New** → **Blueprint**
3. Connect your GitHub repo (`render.yaml` auto-detected)
4. Set env vars in Render dashboard:
   - `BOT_TOKEN` → from [@BotFather](https://t.me/BotFather)
   - `OWNER_ID` → from [@userinfobot](https://t.me/userinfobot)
5. **Deploy** — build command installs `ffmpeg` + `yt-dlp` automatically

> ⚠️ Use **Worker** service type, not Web Service. This bot uses long-polling.

## Supported Platforms (sample)

Twitter/X, TikTok, Reddit, Facebook, Vimeo, Dailymotion, Twitch Clips, SoundCloud, Bilibili, Streamable, Pinterest, Tumblr, and 1000+ more via yt-dlp.

## Error Handling

| Error Type | User Message |
|---|---|
| Blocked platform | Friendly block message with /platforms link |
| Private video | Explains login-required content |
| Geo-restricted | Region restriction notice |
| File too large | Shows file size, suggests lower quality |
| Timeout | Suggests retry or lower quality |
| No formats | DRM / live stream notice |
| Rate limit | Shows wait time |
| Active download | Prevents concurrent downloads |
