const { User } = require('../../../models');
const { lang } = require('../../module/functions');

/**
 * Comandos start
 * 
 * @param {import('telegraf').Context} ctx 
 */
module.exports = async (ctx) => {
    const chat_id = ctx.from.id;
    const langCode = await User.getLang(chat_id);

    await ctx.reply(lang("welcome", langCode, {
        name: ctx.from.first_name,
        username: ctx.botInfo.username
    }), {
        parse_mode: 'Markdown',
        reply_markup: {
            force_reply: true,
            inline_keyboard: [
                [
                    { text: '🎵 Music', switch_inline_query_current_chat: ' ' },
                    { text: '📺 Video', url: 'tg://resolve?domain=YoutubeMusicBetaBot&text=@vid ' }
                ]
            ]
        }
    });
};