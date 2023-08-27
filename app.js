require('dotenv').config();

const { saveLog, env } = require('./src/module/functions');
const TelegramBot = require('./src/telegram/bot');

// Defina a função global para tratamento de exceções
process.on('uncaughtException', (error) => {
    const report = error.stack || error;

    // Registre a exceção em seus logs usando saveLog
    saveLog(report, 'errors');

    const bot = (new TelegramBot()).instance();

    // Reporta o erro ao admin
    bot.telegram.sendMessage(env('canais_permitidos')[2], `<b>Error reportado:</b> <code>${report}</code>`, {
        parse_mode: 'HTML'
    })

    // Encerre o processo, pois ocorreu uma exceção não tratada
    // process.exit(1);
});

// Run's
const Telegram = new TelegramBot();
Telegram.run(false);