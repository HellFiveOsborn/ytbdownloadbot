require('dotenv').config({ override: true });
const { Logger, env } = require('./src/module/functions');
const TelegramBot = require('./src/telegram/bot');

// Função para reportar erros
function reportError(error) {
    const report = error.stack || error.toString();
    Logger.debug('Error on app.js', report);

    try {
        const bot = (new TelegramBot()).instance();
        // Reporta o erro ao admin
        bot.telegram.sendMessage(
            env('CACHE_CHANNEL'),
            `<b>Error:</b> <pre><code class="language-text">${escapeHTML(report)}</code></pre>`,
            { parse_mode: 'HTML' }
        ).catch(err => {
            // Log caso a tentativa de envio de mensagem falhe
            Logger.error('Failed to send error report to Telegram:', err.stack || err);
        });
    } catch (err) {
        // Log caso ocorra um erro ao instanciar o bot ou enviar a mensagem
        Logger.error('Error in error reporting mechanism:', err.stack || err);
    }
}

// Escapa caracteres HTML para evitar a injeção de HTML
function escapeHTML(str) {
    return str.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Trata exceções não capturadas
process.on('uncaughtException', reportError);

// Trata promessas rejeitadas não capturadas
process.on('unhandledRejection', reportError);

// Execução
const Telegram = new TelegramBot();
try {
    Telegram.run(true);
} catch (error) {
    reportError(error);
}
