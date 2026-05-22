const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

loadEnv();

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN is missing. Create .env or to45.env and add your Telegram bot token.');
  process.exit(1);
}

const bot = new Telegraf(token);
const userState = new Map();
const maxOutputBytes = Number(process.env.MAX_OUTPUT_MB || 45) * 1024 * 1024;

const rootDir = __dirname;
const tmpDir = path.join(rootDir, 'tmp');
const downloadsDir = path.join(rootDir, 'downloads');

const languages = {
  ru: {
    name: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439',
    chooseLanguage: '\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u044f\u0437\u044b\u043a:',
    languageSaved: '\u042f\u0437\u044b\u043a \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d. \u041e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 MP3, MOV \u0438\u043b\u0438 \u0441\u0441\u044b\u043b\u043a\u0443 Instagram, YouTube, TikTok.',
    start: '\u041f\u0440\u0438\u0432\u0435\u0442! \u042f \u043a\u043e\u043d\u0432\u0435\u0440\u0442\u0438\u0440\u0443\u044e MP3 \u0432 MP4/MOV, MOV \u0432 MP4 \u0438 \u0441\u043a\u0430\u0447\u0438\u0432\u0430\u044e \u0432\u0438\u0434\u0435\u043e \u043f\u043e \u0441\u0441\u044b\u043b\u043a\u0430\u043c Instagram, YouTube, TikTok.',
    help: '\u041e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 MP3 \u043a\u0430\u043a \u0430\u0443\u0434\u0438\u043e \u0438\u043b\u0438 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442, \u0437\u0430\u0442\u0435\u043c \u0432\u044b\u0431\u0435\u0440\u0438\u0442\u0435 MP4 \u0438\u043b\u0438 MOV. MOV-\u0444\u0430\u0439\u043b \u044f \u0441\u0440\u0430\u0437\u0443 \u043a\u043e\u043d\u0432\u0435\u0440\u0442\u0438\u0440\u0443\u044e \u0432 MP4. \u0422\u0430\u043a\u0436\u0435 \u043c\u043e\u0436\u043d\u043e \u043f\u0440\u0438\u0441\u043b\u0430\u0442\u044c \u0441\u0441\u044b\u043b\u043a\u0443 \u043d\u0430 \u0432\u0438\u0434\u0435\u043e.',
    chooseFormat: '\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0444\u043e\u0440\u043c\u0430\u0442 \u043a\u043e\u043d\u0432\u0435\u0440\u0442\u0430\u0446\u0438\u0438:',
    downloadingFile: '\u0421\u043a\u0430\u0447\u0438\u0432\u0430\u044e \u0444\u0430\u0439\u043b...',
    converting: '\u041a\u043e\u043d\u0432\u0435\u0440\u0442\u0438\u0440\u0443\u044e \u0432 {format}...',
    converted: '\u0413\u043e\u0442\u043e\u0432\u043e: {file}',
    downloadingVideo: '\u0421\u043a\u0430\u0447\u0438\u0432\u0430\u044e \u0432\u0438\u0434\u0435\u043e...',
    unsupportedLink: '\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044e\u0442\u0441\u044f \u0441\u0441\u044b\u043b\u043a\u0438 Instagram, YouTube \u0438 TikTok.',
    sendSupported: '\u041e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 MP3, MOV \u0438\u043b\u0438 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u043c\u0443\u044e \u0441\u0441\u044b\u043b\u043a\u0443.',
    noPendingFile: '\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u043e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 MP3-\u0444\u0430\u0439\u043b.',
    tooLarge: '\u0424\u0430\u0439\u043b \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u0441\u044f \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u0431\u043e\u043b\u044c\u0448\u0438\u043c \u0434\u043b\u044f \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0438 \u0447\u0435\u0440\u0435\u0437 Telegram.',
    toolMissing: '\u041d\u0430 \u043a\u043e\u043c\u043f\u044c\u044e\u0442\u0435\u0440\u0435 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e: {tool}. \u0423\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u0435 \u0435\u0433\u043e \u0438 \u0434\u043e\u0431\u0430\u0432\u044c\u0442\u0435 \u0432 PATH.',
    failed: '\u041d\u0435 \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u043e\u0441\u044c \u0432\u044b\u043f\u043e\u043b\u043d\u0438\u0442\u044c \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u044e. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0444\u0430\u0439\u043b/\u0441\u0441\u044b\u043b\u043a\u0443 \u0438 \u0443\u0442\u0438\u043b\u0438\u0442\u044b.',
    commands: '\u041a\u043e\u043c\u0430\u043d\u0434\u044b: /start, /language, /help'
  },
  en: {
    name: 'English',
    chooseLanguage: 'Choose a language:',
    languageSaved: 'Language saved. Send an MP3, MOV, or an Instagram, YouTube, TikTok link.',
    start: 'Hi! I convert MP3 to MP4/MOV, MOV to MP4, and download videos from Instagram, YouTube, and TikTok links.',
    help: 'Send an MP3 as audio or document, then choose MP4 or MOV. Send a MOV file and I will convert it to MP4. You can also send a video link.',
    chooseFormat: 'Choose conversion format:',
    downloadingFile: 'Downloading file...',
    converting: 'Converting to {format}...',
    converted: 'Done: {file}',
    downloadingVideo: 'Downloading video...',
    unsupportedLink: 'Only Instagram, YouTube, and TikTok links are supported.',
    sendSupported: 'Send an MP3, MOV, or a supported link.',
    noPendingFile: 'Please send an MP3 file first.',
    tooLarge: 'The output file is too large to send through Telegram.',
    toolMissing: 'Missing tool on this computer: {tool}. Install it and add it to PATH.',
    failed: 'The operation failed. Check the file/link and tools.',
    commands: 'Commands: /start, /language, /help'
  },
  de: {
    name: 'Deutsch',
    chooseLanguage: 'Sprache ausw\u00e4hlen:',
    languageSaved: 'Sprache gespeichert. Sende eine MP3, MOV oder einen Instagram-, YouTube-, TikTok-Link.',
    start: 'Hallo! Ich konvertiere MP3 zu MP4/MOV, MOV zu MP4 und lade Videos von Instagram-, YouTube- und TikTok-Links herunter.',
    help: 'Sende eine MP3 als Audio oder Dokument und w\u00e4hle danach MP4 oder MOV. Eine MOV-Datei konvertiere ich direkt zu MP4. Du kannst auch einen Videolink senden.',
    chooseFormat: 'Zielformat ausw\u00e4hlen:',
    downloadingFile: 'Datei wird heruntergeladen...',
    converting: 'Konvertiere zu {format}...',
    converted: 'Fertig: {file}',
    downloadingVideo: 'Video wird heruntergeladen...',
    unsupportedLink: 'Es werden nur Instagram-, YouTube- und TikTok-Links unterst\u00fctzt.',
    sendSupported: 'Sende eine MP3, MOV oder einen unterst\u00fctzten Link.',
    noPendingFile: 'Bitte sende zuerst eine MP3-Datei.',
    tooLarge: 'Die Ausgabedatei ist zu gro\u00df f\u00fcr Telegram.',
    toolMissing: 'Fehlendes Programm auf diesem Computer: {tool}. Installiere es und f\u00fcge es zu PATH hinzu.',
    failed: 'Der Vorgang ist fehlgeschlagen. Pr\u00fcfe Datei/Link und Programme.',
    commands: 'Befehle: /start, /language, /help'
  }
};

function loadEnv() {
  for (const fileName of ['.env', 'to45.env']) {
    const envPath = path.join(__dirname, fileName);
    if (!fs.existsSync(envPath)) continue;

    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex === -1) continue;
      const key = trimmed.slice(0, equalIndex).trim();
      const value = trimmed.slice(equalIndex + 1).trim().replace(/^["']|["']$/g, '');
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function t(ctx, key, values = {}) {
  const lang = getLang(ctx);
  let text = languages[lang][key] || languages.en[key] || key;
  for (const [name, value] of Object.entries(values)) {
    text = text.replaceAll(`{${name}}`, value);
  }
  return text;
}

function getLang(ctx) {
  return userState.get(ctx.from?.id)?.lang || 'ru';
}

function setLang(userId, lang) {
  const current = userState.get(userId) || {};
  userState.set(userId, { ...current, lang });
}

function setPendingAudio(userId, filePath) {
  const current = userState.get(userId) || { lang: 'ru' };
  userState.set(userId, { ...current, pendingAudio: filePath });
}

function getPendingAudio(userId) {
  return userState.get(userId)?.pendingAudio;
}

function languageKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Deutsch', 'lang:de')],
    [Markup.button.callback('English', 'lang:en')],
    [Markup.button.callback('\u0420\u0443\u0441\u0441\u043a\u0438\u0439', 'lang:ru')]
  ]);
}

function formatKeyboard() {
  return Markup.inlineKeyboard([
    Markup.button.callback('MP4', 'convert:mp4'),
    Markup.button.callback('MOV', 'convert:mov')
  ]);
}

function isSupportedVideoUrl(text) {
  try {
    const url = new URL(text.trim());
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    return [
      'instagram.com',
      'youtube.com',
      'youtu.be',
      'tiktok.com',
      'vm.tiktok.com',
      'vt.tiktok.com'
    ].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function getMessageFile(message) {
  const document = message.document;
  const audio = message.audio;
  const video = message.video;
  if (document) {
    return {
      fileId: document.file_id,
      fileName: document.file_name || 'file',
      mimeType: document.mime_type || ''
    };
  }
  if (audio) {
    return {
      fileId: audio.file_id,
      fileName: audio.file_name || 'audio.mp3',
      mimeType: audio.mime_type || ''
    };
  }
  if (video) {
    return {
      fileId: video.file_id,
      fileName: video.file_name || 'video.mov',
      mimeType: video.mime_type || ''
    };
  }
  return null;
}

function getMediaKind(file) {
  const fileName = file.fileName.toLowerCase();
  const mimeType = file.mimeType.toLowerCase();
  if (fileName.endsWith('.mp3') || mimeType === 'audio/mpeg') return 'mp3';
  if (fileName.endsWith('.mov') || mimeType === 'video/quicktime') return 'mov';
  return null;
}

function getFileExtension(name, fallback) {
  const extension = path.extname(name || '').toLowerCase();
  return extension || fallback;
}

async function ensureDirs() {
  await fsp.mkdir(tmpDir, { recursive: true });
  await fsp.mkdir(downloadsDir, { recursive: true });
}

async function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  return new Promise((resolve) => {
    const child = spawn(checker, [command], { windowsHide: true });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

async function requireTool(ctx, command) {
  const exists = await commandExists(command);
  if (!exists) {
    await ctx.reply(t(ctx, 'toolMissing', { tool: command }));
    return false;
  }
  return true;
}

async function downloadUrl(url, destination) {
  const client = url.startsWith('https:') ? https : http;
  await new Promise((resolve, reject) => {
    const request = client.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadUrl(response.headers.location, destination).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });

    request.on('error', reject);
  });
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    let stderr = '';

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      }
    });
  });
}

async function convertMp3ToVideo(input, output, format) {
  const codecArgs = format === 'mov'
    ? ['-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'aac', '-b:a', '192k']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-c:a', 'aac', '-b:a', '192k'];

  await runProcess('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=0x111827:s=1280x720:r=30',
    '-i', input,
    '-shortest',
    ...codecArgs,
    '-pix_fmt', 'yuv420p',
    output
  ]);
}

async function convertMovToMp4(input, output) {
  await runProcess('ffmpeg', [
    '-y',
    '-i', input,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-pix_fmt', 'yuv420p',
    output
  ]);
}

async function downloadSocialVideo(url, outputTemplate) {
  await runProcess('yt-dlp', [
    '--no-playlist',
    '--merge-output-format', 'mp4',
    '-f', 'bv*+ba/best',
    '-o', outputTemplate,
    url
  ]);
}

async function assertSendable(ctx, filePath) {
  const stats = await fsp.stat(filePath);
  if (stats.size > maxOutputBytes) {
    await ctx.reply(t(ctx, 'tooLarge'));
    return false;
  }
  return true;
}

async function cleanup(filePaths) {
  await Promise.all(filePaths.filter(Boolean).map((filePath) => (
    fsp.rm(filePath, { force: true }).catch(() => {})
  )));
}

async function downloadTelegramFile(ctx, telegramFile, fallbackExtension) {
  await ensureDirs();
  const input = path.join(
    tmpDir,
    `${Date.now()}-${crypto.randomUUID()}${getFileExtension(telegramFile.fileName, fallbackExtension)}`
  );
  const link = await ctx.telegram.getFileLink(telegramFile.fileId);
  await downloadUrl(link.href, input);
  return input;
}

async function sendConvertedFile(ctx, filePath, format) {
  const payload = { source: filePath };
  const options = { caption: t(ctx, 'converted', { file: path.basename(filePath) }) };
  if (format === 'mp4') {
    await ctx.replyWithVideo(payload, options);
  } else {
    await ctx.replyWithDocument(payload, options);
  }
}

bot.start(async (ctx) => {
  await ctx.reply(languages.ru.chooseLanguage, languageKeyboard());
});

bot.command('language', async (ctx) => {
  await ctx.reply(t(ctx, 'chooseLanguage'), languageKeyboard());
});

bot.help(async (ctx) => {
  await ctx.reply(`${t(ctx, 'help')}\n\n${t(ctx, 'commands')}`);
});

bot.action(/^lang:(ru|en|de)$/, async (ctx) => {
  const lang = ctx.match[1];
  setLang(ctx.from.id, lang);
  await ctx.answerCbQuery(languages[lang].name);
  await ctx.editMessageText(languages[lang].languageSaved);
  await ctx.reply(`${languages[lang].start}\n\n${languages[lang].help}`);
});

bot.action(/^convert:(mp4|mov)$/, async (ctx) => {
  const format = ctx.match[1];
  const input = getPendingAudio(ctx.from.id);
  if (!input) {
    await ctx.answerCbQuery();
    await ctx.reply(t(ctx, 'noPendingFile'));
    return;
  }

  await ctx.answerCbQuery(format.toUpperCase());
  if (!(await requireTool(ctx, 'ffmpeg'))) return;

  await ctx.reply(t(ctx, 'converting', { format: format.toUpperCase() }));

  const output = path.join(downloadsDir, `${Date.now()}-${crypto.randomUUID()}.${format}`);
  try {
    await convertMp3ToVideo(input, output, format);
    if (await assertSendable(ctx, output)) {
      await sendConvertedFile(ctx, output, format);
    }
  } catch (error) {
    console.error(error);
    await ctx.reply(t(ctx, 'failed'));
  } finally {
    await cleanup([input, output]);
    setPendingAudio(ctx.from.id, undefined);
  }
});

bot.on(['audio', 'document', 'video'], async (ctx) => {
  const telegramFile = getMessageFile(ctx.message);
  const kind = telegramFile ? getMediaKind(telegramFile) : null;

  if (!kind) {
    await ctx.reply(t(ctx, 'sendSupported'));
    return;
  }

  if (kind === 'mp3') {
    await ctx.reply(t(ctx, 'downloadingFile'));
    const input = await downloadTelegramFile(ctx, telegramFile, '.mp3').catch(async (error) => {
      console.error(error);
      await ctx.reply(t(ctx, 'failed'));
      return null;
    });
    if (!input) return;

    await cleanup([getPendingAudio(ctx.from.id)]);
    setPendingAudio(ctx.from.id, input);
    await ctx.reply(t(ctx, 'chooseFormat'), formatKeyboard());
    return;
  }

  if (!(await requireTool(ctx, 'ffmpeg'))) return;

  let input;
  const output = path.join(downloadsDir, `${Date.now()}-${crypto.randomUUID()}.mp4`);
  try {
    await ctx.reply(t(ctx, 'downloadingFile'));
    input = await downloadTelegramFile(ctx, telegramFile, '.mov');
    await ctx.reply(t(ctx, 'converting', { format: 'MP4' }));
    await convertMovToMp4(input, output);
    if (await assertSendable(ctx, output)) {
      await sendConvertedFile(ctx, output, 'mp4');
    }
  } catch (error) {
    console.error(error);
    await ctx.reply(t(ctx, 'failed'));
  } finally {
    await cleanup([input, output]);
  }
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (!isSupportedVideoUrl(text)) {
    await ctx.reply(t(ctx, 'unsupportedLink'));
    return;
  }

  if (!(await requireTool(ctx, 'yt-dlp'))) return;

  await ensureDirs();
  await ctx.reply(t(ctx, 'downloadingVideo'));

  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const outputTemplate = path.join(downloadsDir, `${id}.%(ext)s`);

  try {
    await downloadSocialVideo(text, outputTemplate);
    const files = await fsp.readdir(downloadsDir);
    const downloaded = files
      .filter((file) => file.startsWith(id))
      .map((file) => path.join(downloadsDir, file))[0];

    if (!downloaded) throw new Error('yt-dlp did not create an output file.');

    if (await assertSendable(ctx, downloaded)) {
      await ctx.replyWithVideo({ source: downloaded }, { caption: path.basename(downloaded) });
    }
    await cleanup([downloaded]);
  } catch (error) {
    console.error(error);
    await ctx.reply(t(ctx, 'failed'));
  }
});

bot.catch((error, ctx) => {
  console.error(`Bot error for update ${ctx.update?.update_id}:`, error);
});

async function main() {
  await ensureDirs();
  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Start bot / choose language' },
    { command: 'language', description: 'Change language' },
    { command: 'help', description: 'Show help' }
  ]);
  await bot.launch();
  console.log('Bot is running.');
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
