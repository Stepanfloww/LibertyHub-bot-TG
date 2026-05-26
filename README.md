# LibretyHub Telegram Bot

Telegram bot that:

- converts uploaded MP3 files to MP4 or MOV with a simple generated video background;
- converts uploaded MOV files to MP4;
- downloads videos from Instagram, YouTube, TikTok, VK Video, and Rutube links through `yt-dlp`;
- asks for a platform and quality from 144p to 4K before downloading;
- compresses oversized downloads through FFmpeg when needed so Telegram can send them;
- lets each user choose Russian, English, or German on start;
- lets admins send push notifications to saved users.

## Requirements

Install these programs and make sure they are available in PATH:

- Node.js 18+
- FFmpeg: `ffmpeg` and `ffprobe`
- yt-dlp: `yt-dlp`

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

- Send `/start` to choose a language.
- Send an MP3 as an audio file or document, then choose MP4 or MOV.
- Send a MOV file as a document to convert it to MP4.
- Choose "Download video", choose a platform, send the link, then choose quality from 144p to 4K.
- Admins can send `/push`, then send text, a photo, or a photo with caption. Press "Отправить" to broadcast it from the bot to saved users.
