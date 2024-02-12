const { User } = require('../../../models');
const { lang, getInviteLinks } = require('../../module/functions');

/**
 * Comando Help
 * 
 * @param {import('telegraf').Context} ctx 
 */
module.exports = async (ctx) => {
    const chat_id = ctx.from.id;
    const lang_code = await User.getLang(chat_id);
    const join_link = await getInviteLinks(ctx);

    ctx.reply(lang("help", lang_code, { join_link }), {
        parse_mode: 'Markdown'
    });
}