require('dotenv').config();
const { Logger, env } = require('./src/module/functions');
const TelegramBot = require('./src/telegram/bot');

// Defina a função global para tratamento de exceções
process.on('uncaughtException', (error) => {
    const report = error.stack || error;

    Logger.debug(report);

    const bot = (new TelegramBot()).instance();

    // Reporta o erro ao admin
    bot.telegram.sendMessage(
        env('CACHE_CHANNEL'),
        `<b>Error:</b> <code>${report}</code>`,
        { parse_mode: 'HTML' }
    )
});

// Run's
const Telegram = new TelegramBot();
Telegram.run(true);