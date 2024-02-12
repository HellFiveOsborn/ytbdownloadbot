const { User } = require('../../../models');
const { lang, Logger } = require('../../module/functions');

/**
 * Comandos start
 * 
 * @param {import('telegraf').Context} ctx 
 */
module.exports = async (ctx) => {
    const chat_id = ctx.from.id, langCode = await User.getLang(chat_id);

    await ctx.reply(lang("welcome", langCode, { name: ctx.from.first_name, username: ctx.botInfo.username }), {
        parse_mode: 'Markdown',
        reply_markup: {
            force_reply: true,
        }
    });
};