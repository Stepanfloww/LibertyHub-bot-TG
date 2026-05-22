# LibretyHub Telegram Bot

Telegram bot that:

- converts uploaded MP3 files to MP4 or MOV with a simple generated video background;
- converts uploaded MOV files to MP4;
- downloads videos from Instagram, YouTube, and TikTok links through `yt-dlp`;
- lets each user choose Russian, English, or German on start.

## Requirements

Install these programs and make sure they are available in PATH:

- Node.js 18+
- FFmpeg: `ffmpeg`
- yt-dlp: `yt-dlp`

## Setup

1. Create `.env` from `.env.example` or use the existing `to45.env`.
2. Put your Telegram bot token into `.env` or `to45.env`.
3. Run:

```powershell
npm start
```

The token should not be committed to git. If a token was posted publicly, revoke it in BotFather and create a new one.

## Usage

- Send `/start` to choose a language.
- Send an MP3 as an audio file or document, then choose MP4 or MOV.
- Send a MOV file as a document to convert it to MP4.
- Send a supported video link from Instagram, YouTube, or TikTok.
