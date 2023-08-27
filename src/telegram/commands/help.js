const { usuario, lang } = require('../../module/functions');

/**
 * Comando Help
 * 
 * @param {import('telegraf').Context} ctx 
 * @param {import('better-sqlite3').Database} db 
 */
module.exports = (ctx, db) => {
    const chat_id = ctx.from.id;
    const user = usuario(ctx)
    const langCode = user.hasOwnProperty('lang') ? user.lang : 'en';

    ctx.reply(lang("help", langCode), {
        parse_mode: 'Markdown'
    });
}