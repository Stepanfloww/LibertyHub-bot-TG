const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

let ffmpegPath;
let ffprobePath;
try {
  ffmpegPath = require('ffmpeg-static');
} catch {
  ffmpegPath = null;
}
try {
  ffprobePath = require('ffprobe-static').path;
} catch {
  ffprobePath = null;
}

loadEnv();

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN is missing. Create .env or to45.env and add your Telegram bot token.');
  process.exit(1);
}

const adminIds = new Set(
  (process.env.ADMIN_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id))
    .filter(Boolean)
);

const rootDir = __dirname;
const tmpDir = path.join(rootDir, 'tmp');
const downloadsDir = path.join(rootDir, 'downloads');
const usersFile = path.join(rootDir, 'users.json');

const bot = new Telegraf(token);
const userState = loadUserStore();
const pushDrafts = new Map();
const maxOutputBytes = Number(process.env.MAX_OUTPUT_MB || 45) * 1024 * 1024;
const maxInputBytes = Number(process.env.MAX_INPUT_MB || 45) * 1024 * 1024;

const platforms = {
  instagram: {
    label: '📸 Instagram',
    hosts: ['instagram.com']
  },
  youtube: {
    label: '▶️ YouTube',
    hosts: ['youtube.com', 'youtu.be', 'm.youtube.com']
  },
  tiktok: {
    label: '🎵 TikTok',
    hosts: ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']
  },
  vk: {
    label: '🔵 VK Video',
    hosts: ['vk.com', 'm.vk.com', 'video.vk.com', 'vkvideo.ru', 'vk.ru']
  },
  rutube: {
    label: '📺 Rutube',
    hosts: ['rutube.ru']
  }
};

const musicPlatforms = {
  yandex_music: {
    label: '🟡 Yandex Music',
    hosts: ['music.yandex.ru']
  },
  vk_music: {
    label: '🎧 VK Music',
    hosts: ['vk.com', 'm.vk.com', 'vk.ru']
  },
  youtube_music: {
    label: '▶️ YouTube Music',
    hosts: ['music.youtube.com', 'youtube.com', 'youtu.be', 'm.youtube.com']
  },
  spotify: {
    label: '🟢 Spotify',
    hosts: ['open.spotify.com', 'spotify.com']
  },
  soundcloud: {
    label: '☁️ SoundCloud',
    hosts: ['soundcloud.com', 'm.soundcloud.com']
  }
};

const qualities = [
  { id: '144', label: '144p', height: 144 },
  { id: '240', label: '240p', height: 240 },
  { id: '360', label: '360p', height: 360 },
  { id: '480', label: '480p', height: 480 },
  { id: '720', label: '720p', height: 720 },
  { id: '1080', label: '1080p', height: 1080 },
  { id: '1440', label: '2K', height: 1440 },
  { id: '2160', label: '4K', height: 2160 }
];

const qualityChoicePlatforms = new Set(['youtube', 'rutube', 'vk']);

const messages = {
  start: 'Привет! Выберите действие кнопкой ниже.',
  help: 'Простите, но мы вам не поможем 🤗',
  downloadingFile: 'Скачиваю файл...',
  converting: 'Конвертирую в {format}...',
  converted: 'Готово!',
  downloadingVideo: 'Скачиваю видео...',
  unsupportedLink: 'Поддерживаются ссылки Instagram, YouTube, TikTok, VK Video и Rutube.',
  sendMp3: 'Отправьте MP3-файл для конвертации в MP4 ',
  sendMp4: 'Отправьте MP4-файл для конвертации в MP3',
  sendSupported: 'Отправьте файл подходящего формата для выбранной конвертации.',
  tooLarge: 'Конвертирую файл... ',
  inputTooLarge: 'Этот файл слишком большой для скачивания. Отправьте файл до {limit} МБ или сожмите видео перед конвертацией.',
  toolMissing: 'Подождите... Ломаемся! {tool}.',
  failed: 'Не получилось, простите...',
  mainMenu: 'Выберите действие:',
  convertMenu: 'Выберите тип конвертации:',
  downloadMenu: 'Выберите платформу:',
  platformChosen: 'Пришлите ссылку {platform}.',
  wrongPlatform: 'Попробуйте ещё раз.',
  chooseQuality: 'Выберите качество:',
  qualityChosen: 'Скачиваю {quality}...',
  compressingVideo: 'Файл большой. Начинаю сжимать...',
  convertFilesButton: "🔁 Конвертация файлов 🔁",
  mp4ToMp3Button: "🎬 MP4 в MP3 🎵",
  mp3ToMp4Button: '🎵 MP3 в MP4 🎬',
  downloadVideoButton: "🔽 Скачать видео 🔽",
  backButton: 'Назад',
  chooseFromMenu: 'Сначала выберите раздел в меню.',
  commands: 'Команды: /start, /help'
};
Object.assign(messages, {
  musicDownloadMenu: 'Выберите звуковую платформу:',
  musicPlatformChosen: 'Пришлите ссылку {platform}. Бот скачает аудио в MP3.',
  unsupportedMusicLink: 'Напишите /start',
  downloadingAudio: 'Скачиваю аудио и конвертирую в MP3...',
  downloadAudioButton: '⏪ Скачать со звуковых платформ ⏩'
});

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

function loadUserStore() {
  if (!fs.existsSync(usersFile)) return new Map();

  try {
    const raw = fs.readFileSync(usersFile, 'utf8');
    const parsed = JSON.parse(raw);
    return new Map(Object.entries(parsed).map(([userId, state]) => [userKey(userId), state]));
  } catch (error) {
    console.error('Could not read users.json:', error);
    return new Map();
  }
}

function saveUserStore() {
  const data = {};
  for (const [userId, state] of userState.entries()) {
    data[userKey(userId)] = { mode: state.mode || 'menu' };
  }

  fs.writeFileSync(usersFile, JSON.stringify(data, null, 2));
}

function userKey(userId) {
  return String(userId);
}

function updateUserState(userId, patch) {
  const key = userKey(userId);
  const current = userState.get(key) || {};
  const next = { ...current, ...patch };
  userState.set(key, next);
  saveUserStore();
  return next;
}

function ensureKnownUser(userId) {
  if (!userId) return;
  const key = userKey(userId);
  if (userState.has(key)) return;
  userState.set(key, { mode: 'menu' });
  saveUserStore();
}

function t(ctx, key, values = {}) {
  let text = messages[key] || key;
  for (const [name, value] of Object.entries(values)) {
    text = text.replaceAll(`{${name}}`, value);
  }
  return text;
}

function setMode(userId, mode) {
  updateUserState(userId, { mode });
}

function isAdmin(userId) {
  return adminIds.has(String(userId));
}

function getPushText(ctx) {
  const text = ctx.message?.text || '';
  const command = ctx.message?.entities?.find((entity) => entity.type === 'bot_command' && entity.offset === 0);
  if (!command) return '';
  return text.slice(command.length).trim();
}

function getBroadcastUserIds() {
  return [...userState.keys()];
}

function pushKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Отправить', 'push:send')],
    [Markup.button.callback('Отмена', 'push:cancel')]
  ]);
}

function getPushDraft(userId) {
  return pushDrafts.get(userKey(userId));
}

function setPushDraft(userId, patch) {
  const key = userKey(userId);
  const current = pushDrafts.get(key) || {};
  const next = { ...current, ...patch };
  pushDrafts.set(key, next);
  return next;
}

function clearPushDraft(userId) {
  pushDrafts.delete(userKey(userId));
}

function getLargestPhotoFileId(message) {
  const photos = message?.photo || [];
  return photos.length ? photos[photos.length - 1].file_id : null;
}

function describePushDraft(draft) {
  const parts = ['Черновик push-уведомления:'];
  parts.push(`Текст: ${draft.text ? 'добавлен' : 'не добавлен'}`);
  parts.push(`Фото: ${draft.photoFileId ? 'добавлено' : 'не добавлено'}`);
  parts.push('');
  parts.push('Можно прислать текст, фото или фото с подписью. Когда всё готово, нажмите «Отправить».');
  return parts.join('\n');
}

async function sendPushToUser(userId, draft) {
  if (draft.photoFileId) {
    if (draft.text && draft.text.length <= 1024) {
      await bot.telegram.sendPhoto(userId, draft.photoFileId, { caption: draft.text });
      return;
    }

    await bot.telegram.sendPhoto(userId, draft.photoFileId);
    if (draft.text) await bot.telegram.sendMessage(userId, draft.text);
    return;
  }

  await bot.telegram.sendMessage(userId, draft.text);
}

function getMode(userId) {
  return userState.get(userKey(userId))?.mode || 'menu';
}

function setPendingDownload(userId, patch) {
  const key = userKey(userId);
  const current = userState.get(key) || {};
  const pendingDownload = { ...(current.pendingDownload || {}), ...patch };
  userState.set(key, { ...current, pendingDownload });
}

function getPendingDownload(userId) {
  return userState.get(userKey(userId))?.pendingDownload;
}

function clearPendingDownload(userId) {
  const key = userKey(userId);
  const current = userState.get(key) || {};
  userState.set(key, { ...current, pendingDownload: undefined });
}

function mainMenuKeyboard(ctx) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(ctx, 'convertFilesButton'), 'menu:convert')],
    [Markup.button.callback(t(ctx, 'downloadVideoButton'), 'menu:download')],
    [Markup.button.callback(t(ctx, 'downloadAudioButton'), 'menu:download_music')]
  ]);
}

function backKeyboard(ctx) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(ctx, 'backButton'), 'menu:back')]
  ]);
}

function convertKeyboard(ctx) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(ctx, 'mp4ToMp3Button'), 'convert:mp4_to_mp3')],
    [Markup.button.callback(t(ctx, 'mp3ToMp4Button'), 'convert:mp3_to_mp4')],
    [Markup.button.callback(t(ctx, 'backButton'), 'menu:back')]
  ]);
}

function platformKeyboard(ctx) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(platforms.instagram.label, 'platform:instagram')],
    [Markup.button.callback(platforms.youtube.label, 'platform:youtube')],
    [Markup.button.callback(platforms.tiktok.label, 'platform:tiktok')],
    [
      Markup.button.callback(platforms.vk.label, 'platform:vk'),
      Markup.button.callback(platforms.rutube.label, 'platform:rutube')
    ],
    [Markup.button.callback(t(ctx, 'backButton'), 'menu:back')]
  ]);
}

function musicPlatformKeyboard(ctx) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(musicPlatforms.yandex_music.label, 'music_platform:yandex_music')],
    [Markup.button.callback(musicPlatforms.vk_music.label, 'music_platform:vk_music')],
    [Markup.button.callback(musicPlatforms.youtube_music.label, 'music_platform:youtube_music')],
    [
      Markup.button.callback(musicPlatforms.spotify.label, 'music_platform:spotify'),
      Markup.button.callback(musicPlatforms.soundcloud.label, 'music_platform:soundcloud')
    ],
    [Markup.button.callback(t(ctx, 'backButton'), 'menu:back')]
  ]);
}

function qualityKeyboard(ctx) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('144p', 'quality:144'),
      Markup.button.callback('240p', 'quality:240'),
      Markup.button.callback('360p', 'quality:360')
    ],
    [
      Markup.button.callback('480p', 'quality:480'),
      Markup.button.callback('720p', 'quality:720'),
      Markup.button.callback('1080p', 'quality:1080')
    ],
    [
      Markup.button.callback('2K', 'quality:1440'),
      Markup.button.callback('4K', 'quality:2160')
    ],
    [Markup.button.callback(t(ctx, 'backButton'), 'menu:back')]
  ]);
}

function getPlatformIdFromUrl(text, platformMap) {
  try {
    const url = new URL(text.trim());
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    for (const [platformId, platform] of Object.entries(platformMap)) {
      if (platform.hosts.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
        return platformId;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function getPlatformFromUrl(text) {
  return getPlatformIdFromUrl(text, platforms);
}

function getMusicPlatformFromUrl(text) {
  return getPlatformIdFromUrl(text, musicPlatforms);
}

function isSupportedVideoUrl(text) {
  return Boolean(getPlatformFromUrl(text));
}

function getQuality(qualityId) {
  return qualities.find((quality) => quality.id === qualityId);
}

function getMessageFile(message) {
  const document = message.document;
  const audio = message.audio;
  const video = message.video;
  if (document) {
    return {
      fileId: document.file_id,
      fileName: document.file_name || 'file',
      mimeType: document.mime_type || '',
      fileSize: document.file_size || 0
    };
  }
  if (audio) {
    return {
      fileId: audio.file_id,
      fileName: audio.file_name || 'audio.mp3',
      mimeType: audio.mime_type || '',
      fileSize: audio.file_size || 0
    };
  }
  if (video) {
    return {
      fileId: video.file_id,
      fileName: video.file_name || 'video.mp4',
      mimeType: video.mime_type || '',
      fileSize: video.file_size || 0
    };
  }
  return null;
}

function getMediaKind(file) {
  const fileName = file.fileName.toLowerCase();
  const mimeType = file.mimeType.toLowerCase();
  if (fileName.endsWith('.mp3') || mimeType === 'audio/mpeg') return 'mp3';
  if (fileName.endsWith('.mp4') || mimeType === 'video/mp4') return 'mp4';
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
  if (resolveToolPath(command) !== command) return true;

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

function resolveToolPath(command) {
  const localTool = process.platform === 'win32'
    ? path.join(rootDir, 'tools', `${command}.exe`)
    : path.join(rootDir, 'tools', command);
  if (fs.existsSync(localTool)) return localTool;
  if (command === 'ffmpeg' && ffmpegPath) return ffmpegPath;
  if (command === 'ffprobe' && ffprobePath) return ffprobePath;
  return command;
}

async function downloadUrl(url, destination) {
  const client = url.startsWith('https:') ? https : http;
  await new Promise((resolve, reject) => {
    const request = client.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (response) => {
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

async function postFormJson(url, form) {
  const body = new URLSearchParams(form).toString();
  const parsedUrl = new URL(url);
  const client = parsedUrl.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.request({
      method: 'POST',
      hostname: parsedUrl.hostname,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'Mozilla/5.0'
      }
    }, (response) => {
      let data = '';

      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`POST ${url} failed with status ${response.statusCode}`));
          return;
        }

        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const executable = resolveToolPath(command);
    const child = spawn(executable, args, { windowsHide: true, ...options });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      }
    });
  });
}

async function convertMp3ToMp4(input, output) {
  await runProcess('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=0x111827:s=1280x720:r=30',
    '-i', input,
    '-shortest',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'stillimage',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    output
  ]);
}

async function convertMp4ToMp3(input, output) {
  await runProcess('ffmpeg', [
    '-y',
    '-i', input,
    '-vn',
    '-c:a', 'libmp3lame',
    '-b:a', '192k',
    output
  ]);
}

function buildFormatSelector(height) {
  const video = [
    `bv*[height<=${height}][ext=mp4]+ba[ext=m4a]`,
    `bv*[height<=${height}]+ba`,
    `b[height<=${height}][ext=mp4]`,
    `b[height<=${height}]`,
    'worst[ext=mp4]',
    'worst'
  ];

  return video.join('/');
}

function buildBestVideoFormatSelector() {
  return [
    'bv*[ext=mp4]+ba[ext=m4a]',
    'bv*+ba',
    'b[ext=mp4]',
    'b'
  ].join('/');
}

async function downloadSocialVideo(url, outputTemplate, quality) {
  const args = [
    '--socket-timeout', '60',
    '--retries', '5',
    '--fragment-retries', '5',
    '--no-playlist',
    '--merge-output-format', 'mp4',
    '--recode-video', 'mp4',
    '-f', quality ? buildFormatSelector(quality.height) : buildBestVideoFormatSelector(),
    '-o', outputTemplate,
    url
  ];

  await runProcess('yt-dlp', args);
}

async function downloadTikTokViaTikwm(url, destination) {
  const response = await postFormJson('https://www.tikwm.com/api/', {
    url,
    hd: '1'
  });
  const videoUrl = response?.data?.hdplay || response?.data?.play || response?.data?.wmplay;
  if (response?.code !== 0 || !videoUrl) {
    throw new Error(`TikWM did not return a video URL: ${response?.msg || 'unknown error'}`);
  }

  await downloadUrl(videoUrl, destination);
}

async function downloadMusicAudio(url, outputTemplate) {
  await runProcess('yt-dlp', [
    '--no-playlist',
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--embed-metadata',
    '-o', outputTemplate,
    url
  ]);
}

async function downloadSpotifyAudio(url, outputTemplate) {
  await runProcess('spotdl', [
    'download',
    url,
    '--format', 'mp3',
    '--output', outputTemplate,
    '--overwrite', 'force',
    '--ffmpeg', resolveToolPath('ffmpeg')
  ]);
}

async function getVideoDurationSeconds(filePath) {
  const result = await runProcess('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath
  ]);
  const duration = Number(result.stdout.trim());
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

async function compressVideoToLimit(input, output, maxBytes, maxHeight) {
  const duration = await getVideoDurationSeconds(input);
  const usableBytes = Math.max(1024 * 1024, maxBytes - (512 * 1024));
  const totalKbps = duration ? Math.floor((usableBytes * 8) / duration / 1000) : 700;
  const audioKbps = Math.min(128, Math.max(48, Math.floor(totalKbps * 0.18)));
  const videoKbps = Math.max(180, totalKbps - audioKbps);
  const scaleFilter = `scale=-2:'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`;

  await runProcess('ffmpeg', [
    '-y',
    '-i', input,
    '-vf', scaleFilter,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-b:v', `${videoKbps}k`,
    '-maxrate', `${videoKbps}k`,
    '-bufsize', `${videoKbps * 2}k`,
    '-c:a', 'aac',
    '-b:a', `${audioKbps}k`,
    '-movflags', '+faststart',
    '-pix_fmt', 'yuv420p',
    output
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

async function deleteMessageSafe(ctx, message) {
  if (!message?.message_id) return;

  await ctx.telegram.deleteMessage(ctx.chat.id, message.message_id).catch(() => {});
}

async function showMainMenu(ctx, edit = false) {
  setMode(ctx.from.id, 'menu');
  const text = t(ctx, 'mainMenu');
  const keyboard = mainMenuKeyboard(ctx);

  if (edit) {
    await ctx.editMessageText(text, keyboard).catch(() => ctx.reply(text, keyboard));
    return;
  }

  await ctx.reply(text, keyboard);
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
  } else if (format === 'mp3') {
    await ctx.replyWithAudio(payload, options);
  } else {
    await ctx.replyWithDocument(payload, options);
  }
}

async function sendDownloadedVideo(ctx, filePath, quality, statusMessage) {
  const stats = await fsp.stat(filePath);
  let sendPath = filePath;
  let compressedPath;

  if (stats.size > maxOutputBytes) {
    if (!(await requireTool(ctx, 'ffmpeg')) || !(await requireTool(ctx, 'ffprobe'))) {
      await ctx.reply(t(ctx, 'tooLarge'));
      return;
    }

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      undefined,
      t(ctx, 'compressingVideo')
    ).catch(() => {});

    compressedPath = path.join(downloadsDir, `${Date.now()}-${crypto.randomUUID()}-compressed.mp4`);
    await compressVideoToLimit(filePath, compressedPath, maxOutputBytes, quality?.height || 1080);

    if (!(await assertSendable(ctx, compressedPath))) {
      await cleanup([compressedPath]);
      return;
    }

    sendPath = compressedPath;
  }

  try {
    await ctx.replyWithVideo(
      { source: sendPath },
      { caption: 'Готово' }
    );
  } finally {
    await cleanup([compressedPath]);
  }
}

async function handleVideoDownload(ctx, pending, quality = null) {
  if (!(await requireTool(ctx, 'yt-dlp'))) return;

  await ensureDirs();

  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const outputTemplate = path.join(downloadsDir, `${id}.%(ext)s`);
  let statusMessage;
  let downloaded;

  try {
    statusMessage = await ctx.reply(
      quality ? t(ctx, 'qualityChosen', { quality: quality.label }) : t(ctx, 'downloadingVideo')
    );
    try {
      await downloadSocialVideo(pending.url, outputTemplate, quality);
    } catch (error) {
      if (pending.platform !== 'tiktok') throw error;
      console.error('yt-dlp TikTok download failed, trying TikWM fallback:', error.message || error);
      downloaded = path.join(downloadsDir, `${id}.mp4`);
      await downloadTikTokViaTikwm(pending.url, downloaded);
    }
    const files = await fsp.readdir(downloadsDir);
    downloaded ||= files
      .filter((file) => file.startsWith(id))
      .map((file) => path.join(downloadsDir, file))[0];

    if (!downloaded) throw new Error('yt-dlp did not create an output file.');

    await sendDownloadedVideo(ctx, downloaded, quality, statusMessage);
    await deleteMessageSafe(ctx, statusMessage);
    clearPendingDownload(ctx.from.id);
    setMode(ctx.from.id, 'download');
  } catch (error) {
    console.error(error);
    await ctx.reply(t(ctx, 'failed'));
  } finally {
    await deleteMessageSafe(ctx, statusMessage);
    await cleanup([downloaded]);
  }
}

bot.use(async (ctx, next) => {
  ensureKnownUser(ctx.from?.id);
  return next();
});

bot.start(async (ctx) => {
  await showMainMenu(ctx);
});

bot.help(async (ctx) => {
  await ctx.reply(t(ctx, 'help'));
});

bot.command('push', async (ctx) => {
  if (!adminIds.size) {
    await ctx.reply('Push notifications are disabled. Add ADMIN_IDS to .env or to45.env.');
    return;
  }

  if (!isAdmin(ctx.from.id)) {
    return;
  }

  const message = getPushText(ctx);
  const draft = setPushDraft(ctx.from.id, { text: message || undefined, photoFileId: undefined });
  await ctx.reply(describePushDraft(draft), pushKeyboard());
});

bot.action('push:cancel', async (ctx) => {
  if (!isAdmin(ctx.from.id) || !getPushDraft(ctx.from.id)) {
    await ctx.answerCbQuery();
    return;
  }

  clearPushDraft(ctx.from.id);
  await ctx.answerCbQuery('Отменено');
  await ctx.editMessageText('Push-уведомление отменено.').catch(() => ctx.reply('Push-уведомление отменено.'));
});

bot.action('push:send', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    await ctx.answerCbQuery();
    return;
  }

  const draft = getPushDraft(ctx.from.id);
  if (!draft) {
    await ctx.answerCbQuery('Нет черновика');
    return;
  }

  if (!draft.text && !draft.photoFileId) {
    await ctx.answerCbQuery('Добавьте текст или фото');
    return;
  }

  const userIds = getBroadcastUserIds();
  if (!userIds.length) {
    await ctx.answerCbQuery();
    await ctx.reply('No users to notify yet.');
    return;
  }

  await ctx.answerCbQuery('Отправляю');

  let sent = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      await sendPushToUser(userId, draft);
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(`Could not send push to ${userId}:`, error.description || error.message || error);
    }
  }

  clearPushDraft(ctx.from.id);
  await ctx.reply(`Push finished. Sent: ${sent}. Failed: ${failed}.`);
});

bot.action('menu:convert', async (ctx) => {
  setMode(ctx.from.id, 'convert');
  await ctx.answerCbQuery();
  await ctx.editMessageText(t(ctx, 'convertMenu'), convertKeyboard(ctx));
});

bot.action('menu:download', async (ctx) => {
  setMode(ctx.from.id, 'download');
  clearPendingDownload(ctx.from.id);
  await ctx.answerCbQuery();
  await ctx.editMessageText(t(ctx, 'downloadMenu'), platformKeyboard(ctx));
});

bot.action('menu:download_music', async (ctx) => {
  setMode(ctx.from.id, 'music_download');
  clearPendingDownload(ctx.from.id);
  await ctx.answerCbQuery();
  await ctx.editMessageText(t(ctx, 'musicDownloadMenu'), musicPlatformKeyboard(ctx));
});

bot.action('menu:back', async (ctx) => {
  clearPendingDownload(ctx.from.id);
  await ctx.answerCbQuery();
  await showMainMenu(ctx, true);
});

bot.action(/^platform:(instagram|youtube|tiktok|vk|rutube)$/, async (ctx) => {
  const platformId = ctx.match[1];
  const platform = platforms[platformId];
  setMode(ctx.from.id, 'download_url');
  setPendingDownload(ctx.from.id, { platform: platformId, url: undefined });
  await ctx.answerCbQuery(platform.label);
  await ctx.editMessageText(
    t(ctx, 'platformChosen', { platform: platform.label }),
    backKeyboard(ctx)
  );
});

bot.action(/^music_platform:(yandex_music|vk_music|youtube_music|spotify|soundcloud)$/, async (ctx) => {
  const platformId = ctx.match[1];
  const platform = musicPlatforms[platformId];
  setMode(ctx.from.id, 'music_url');
  setPendingDownload(ctx.from.id, { platform: platformId, url: undefined });
  await ctx.answerCbQuery(platform.label);
  await ctx.editMessageText(
    t(ctx, 'musicPlatformChosen', { platform: platform.label }),
    backKeyboard(ctx)
  );
});

bot.action('convert:mp4_to_mp3', async (ctx) => {
  setMode(ctx.from.id, 'convert_mp4_to_mp3');
  await ctx.answerCbQuery('MP4 в MP3');
  await ctx.editMessageText(t(ctx, 'sendMp4'), backKeyboard(ctx));
});

bot.action('convert:mp3_to_mp4', async (ctx) => {
  setMode(ctx.from.id, 'convert_mp3_to_mp4');
  await ctx.answerCbQuery('MP3 в MP4');
  await ctx.editMessageText(t(ctx, 'sendMp3'), backKeyboard(ctx));
});

bot.action(/^quality:(144|240|360|480|720|1080|1440|2160)$/, async (ctx) => {
  const quality = getQuality(ctx.match[1]);
  const pending = getPendingDownload(ctx.from.id);
  if (!quality || !pending?.url) {
    await ctx.answerCbQuery();
    await ctx.reply(t(ctx, 'chooseFromMenu'), mainMenuKeyboard(ctx));
    return;
  }

  await ctx.answerCbQuery(quality.label);
  await handleVideoDownload(ctx, pending, quality);
});

bot.on('photo', async (ctx) => {
  if (!isAdmin(ctx.from.id) || !getPushDraft(ctx.from.id)) {
    return;
  }

  const photoFileId = getLargestPhotoFileId(ctx.message);
  const caption = ctx.message.caption?.trim();
  const draft = setPushDraft(ctx.from.id, {
    photoFileId,
    ...(caption ? { text: caption } : {})
  });

  await ctx.reply(describePushDraft(draft), pushKeyboard());
});

bot.on(['audio', 'document', 'video'], async (ctx) => {
  const mode = getMode(ctx.from.id);
  if (!['convert_mp4_to_mp3', 'convert_mp3_to_mp4'].includes(mode)) {
    await ctx.reply(t(ctx, 'chooseFromMenu'), mainMenuKeyboard(ctx));
    return;
  }

  const telegramFile = getMessageFile(ctx.message);
  const kind = telegramFile ? getMediaKind(telegramFile) : null;

  if (!kind) {
    await ctx.reply(t(ctx, 'sendSupported'), backKeyboard(ctx));
    return;
  }

  if (mode === 'convert_mp4_to_mp3' && kind !== 'mp4') {
    await ctx.reply(t(ctx, 'sendMp4'), backKeyboard(ctx));
    return;
  }

  if (mode === 'convert_mp3_to_mp4' && kind !== 'mp3') {
    await ctx.reply(t(ctx, 'sendMp3'), backKeyboard(ctx));
    return;
  }

  if (telegramFile.fileSize > maxInputBytes) {
    await ctx.reply(
      t(ctx, 'inputTooLarge', { limit: Math.floor(maxInputBytes / 1024 / 1024) }),
      backKeyboard(ctx)
    );
    return;
  }

  if (!(await requireTool(ctx, 'ffmpeg'))) return;

  let input;
  const outputFormat = mode === 'convert_mp4_to_mp3' ? 'mp3' : 'mp4';
  const inputExtension = kind === 'mp4' ? '.mp4' : '.mp3';
  const output = path.join(downloadsDir, `${Date.now()}-${crypto.randomUUID()}.${outputFormat}`);
  let statusMessage;
  try {
    statusMessage = await ctx.reply(t(ctx, 'downloadingFile'));
    input = await downloadTelegramFile(ctx, telegramFile, inputExtension);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      undefined,
      t(ctx, 'converting', { format: outputFormat.toUpperCase() })
    ).catch(() => {});
    if (outputFormat === 'mp3') {
      await convertMp4ToMp3(input, output);
    } else {
      await convertMp3ToMp4(input, output);
    }
    if (await assertSendable(ctx, output)) {
      await sendConvertedFile(ctx, output, outputFormat);
    }
    await deleteMessageSafe(ctx, statusMessage);
  } catch (error) {
    console.error(error);
    await ctx.reply(t(ctx, 'failed'));
  } finally {
    await deleteMessageSafe(ctx, statusMessage);
    await cleanup([input, output]);
  }
});

bot.on('text', async (ctx) => {
  if (isAdmin(ctx.from.id) && getPushDraft(ctx.from.id)) {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    const draft = setPushDraft(ctx.from.id, { text });
    await ctx.reply(describePushDraft(draft), pushKeyboard());
    return;
  }

  const mode = getMode(ctx.from.id);
  if (!['download_url', 'music_url'].includes(mode)) {
    await ctx.reply(t(ctx, 'chooseFromMenu'), mainMenuKeyboard(ctx));
    return;
  }

  const text = ctx.message.text.trim();
  if (mode === 'music_url') {
    const urlPlatform = getMusicPlatformFromUrl(text);
    if (!urlPlatform) {
      await ctx.reply(t(ctx, 'unsupportedMusicLink'), backKeyboard(ctx));
      return;
    }

    const pending = getPendingDownload(ctx.from.id);
    if (!pending?.platform) {
      await ctx.reply(t(ctx, 'musicDownloadMenu'), musicPlatformKeyboard(ctx));
      return;
    }

    if (pending.platform !== urlPlatform) {
      await ctx.reply(
        t(ctx, 'wrongPlatform', { platform: musicPlatforms[pending.platform].label }),
        musicPlatformKeyboard(ctx)
      );
      return;
    }

    if (pending.platform === 'spotify') {
      if (!(await requireTool(ctx, 'spotdl')) || !(await requireTool(ctx, 'ffmpeg'))) return;
    } else if (!(await requireTool(ctx, 'yt-dlp')) || !(await requireTool(ctx, 'ffmpeg'))) {
      return;
    }

    await ensureDirs();

    const id = `${Date.now()}-${crypto.randomUUID()}`;
    const outputTemplate = pending.platform === 'spotify'
      ? path.join(downloadsDir, `${id}.{output-ext}`)
      : path.join(downloadsDir, `${id}.%(ext)s`);
    let statusMessage;
    let downloaded;

    try {
      statusMessage = await ctx.reply(t(ctx, 'downloadingAudio'));
      if (pending.platform === 'spotify') {
        await downloadSpotifyAudio(text, outputTemplate);
      } else {
        await downloadMusicAudio(text, outputTemplate);
      }
      const files = await fsp.readdir(downloadsDir);
      downloaded = files
        .filter((file) => file.startsWith(id))
        .map((file) => path.join(downloadsDir, file))[0];

      if (!downloaded) throw new Error('yt-dlp did not create an output audio file.');

      if (await assertSendable(ctx, downloaded)) {
        await ctx.replyWithAudio(
          { source: downloaded },
          { caption: 'Готово' }
        );
      }

      await deleteMessageSafe(ctx, statusMessage);
      clearPendingDownload(ctx.from.id);
      setMode(ctx.from.id, 'music_download');
    } catch (error) {
      console.error(error);
      await ctx.reply(t(ctx, 'failed'));
    } finally {
      await deleteMessageSafe(ctx, statusMessage);
      await cleanup([downloaded]);
    }
    return;
  }

  const urlPlatform = getPlatformFromUrl(text);
  if (!urlPlatform) {
    await ctx.reply(t(ctx, 'unsupportedLink'), backKeyboard(ctx));
    return;
  }

  const pending = getPendingDownload(ctx.from.id);
  if (!pending?.platform) {
    await ctx.reply(t(ctx, 'downloadMenu'), platformKeyboard(ctx));
    return;
  }

  if (pending.platform !== urlPlatform) {
    await ctx.reply(
      t(ctx, 'wrongPlatform', { platform: platforms[pending.platform].label }),
      platformKeyboard(ctx)
    );
    return;
  }

  setPendingDownload(ctx.from.id, { url: text });
  const download = getPendingDownload(ctx.from.id);
  if (qualityChoicePlatforms.has(download.platform)) {
    await ctx.reply(t(ctx, 'chooseQuality'), qualityKeyboard(ctx));
    return;
  }

  await handleVideoDownload(ctx, download);
});

bot.catch((error, ctx) => {
  console.error(`Bot error for update ${ctx.update?.update_id}:`, error);
});

async function main() {
  await ensureDirs();
  const userCommands = [
    { command: 'start', description: 'Open menu' },
    { command: 'help', description: 'Show help' }
  ];
  const adminCommands = [
    ...userCommands,
    { command: 'push', description: 'Admin: send notification' }
  ];

  await bot.telegram.setMyCommands(userCommands);
  for (const adminId of adminIds) {
    await bot.telegram.setMyCommands(adminCommands, {
      scope: { type: 'chat', chat_id: Number(adminId) }
    });
  }

  await bot.launch();
  console.log('Bot is running.');
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
