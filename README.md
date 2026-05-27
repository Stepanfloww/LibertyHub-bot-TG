# LibretyHub Telegram Bot

Telegram bot that:

- converts uploaded MP3 files to MP4 with a generated video background;
- converts uploaded MP4 files to MP3;
- downloads videos from Instagram, YouTube, TikTok, VK Video, and Rutube links through `yt-dlp`;
- downloads audio as MP3 from Yandex Music, VK Music, YouTube Music, Spotify, and SoundCloud links when `yt-dlp` supports the link;
- asks for a video platform and quality from 144p to 4K before downloading;
- compresses oversized videos through FFmpeg when needed so Telegram can send them;
- lets admins send push notifications to saved users.

## What to install

Install these programs and make sure they are available in `PATH`:

- Node.js 18+
- yt-dlp: `yt-dlp`

FFmpeg and ffprobe are installed as npm dependencies and are used automatically by the bot. On Windows, the easiest way to install the remaining system tools is:

```powershell
winget install OpenJS.NodeJS.LTS
winget install yt-dlp.yt-dlp
```

If `winget` is not available, download manually:

- Node.js: https://nodejs.org/
- yt-dlp: https://github.com/yt-dlp/yt-dlp/releases

After installation, check:

```powershell
node -v
npm -v
yt-dlp --version
```

## Project dependencies

The npm dependency is already listed in `package.json`:

```powershell
npm install
```

No separate npm package is needed for each platform. Video and music downloading is handled by `yt-dlp`, and MP3/MP4 conversion is handled by FFmpeg.

## Setup

1. Create `.env` from `.env.example` or use the existing `to45.env`.
2. Put your Telegram bot token into `.env` or `to45.env`.
3. Add your Telegram numeric user ID to `ADMIN_IDS` if you want to send push notifications.
4. Run:

```powershell
npm start
```

The token should not be committed to git. If a token was posted publicly, revoke it in BotFather and create a new one.

## Usage

- Send `/start` to open the menu.
- Choose file conversion, then press `MP4 to MP3` or `MP3 to MP4` and send the matching file.
- Choose video download, choose a platform, send the link, then choose quality from 144p to 4K.
- Choose audio services, choose Yandex Music, VK Music, YouTube Music, Spotify, or SoundCloud, then send a link.
- Admins can send `/push`, then send text, a photo, or a photo with caption.

## Notes about music services

Some services restrict downloading or require authorization. For Yandex Music, VK Music, Spotify, and some YouTube Music links, `yt-dlp` may need cookies from a browser or may only support metadata/previews depending on the link and account access. Use this bot only for content you have the right to download.
