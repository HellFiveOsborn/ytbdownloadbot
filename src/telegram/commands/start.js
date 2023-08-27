const { usuario, lang } = require('../../module/functions');

/**
 * Comandos start
 * 
 * @param {import('telegraf').Context} ctx 
 * @param {import('better-sqlite3').Database} db 
 */
module.exports = (ctx, db) => {
    const chat_id = ctx.from.id;
    const user = usuario(ctx)

    ctx.reply(lang("welcome", user.lang || '', { name: ctx.from.first_name }), {
        parse_mode: 'Markdown'
    });
};