const { Telegraf } = require('telegraf');

// Твой личный токен уже вставлен в код
const bot = new Telegraf('8716497704:AAHPVy8UXcnEqnEjR9StxZ5E_Ue-RJVF9G4');

bot.start((ctx) => ctx.reply('Привет! Бот LibretyHub запущен и готов к работе!'));
bot.help((ctx) => ctx.reply('Отправь мне любое сообщение, и я его повторю.'));

bot.on('text', (ctx) => {
    ctx.reply(`Ты написал: ${ctx.message.text}`);
});

console.log('Бот успешно запущен...');
bot.launch();

// Плавная остановка
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));