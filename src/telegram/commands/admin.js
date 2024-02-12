const { User, MidiaCache } = require("../../../models");
const { env, resolve_path, Logger, shortNumerals, lang } = require('../../module/functions');

/**
 * Obtem o total de usuários
 * 
 * @param {import('telegraf').Context} ctx 
 */
const getReport = async (ctx) => {
    const chat_id = ctx.from.id;

    // Verifique se o usuário é um administrador 
    if (!env('ADMIN').includes(chat_id)) {
        return;
    }

    try {
        const totalUsers = shortNumerals(await User.count('id_telegram'));
        const totalUsersBanned = shortNumerals(await User.count({ where: { status: 0 } }));
        const totalCachedMusics = shortNumerals(await MidiaCache.count());

        const maxWidth = 26;
        const report = `📊 *Relatório:*\n  ╚═══════════════╗\n`
            + `  • 👤 *Usuários:*\``.padEnd(maxWidth - String(totalUsers).length, '…') + `\`*${totalUsers}*\n`
            + `  • 🚫 *Banidos:.*\``.padEnd(maxWidth - String(totalUsersBanned).length, '…') + `\`*${totalUsersBanned}*\n`
            + `  • 🎧 *Músicas:.*\``.padEnd(maxWidth - String(totalCachedMusics).length, '…') + `\`*${totalCachedMusics}*\n`
            + `  ════════════════╝`;

        ctx.reply(report, {
            parse_mode: 'Markdown'
        });
    } catch (error) {
        Logger.error(error);
        ctx.reply("Ocorreu um erro ao obter o total de usuários.");
    }
}

/**
 * Banir ou desbanir um usuário.
 * 
 * @param {import('telegraf').Context} ctx 
 */
const banOrUnban = async (ctx) => {
    const chat_id = ctx.from.id;
    const [command, id_telegram] = [ctx.command, ctx.payload];

    // Verifique se o usuário é um administrador 
    if (!env('ADMIN').includes(chat_id)) {
        return;
    }

    if (!id_telegram) {
        ctx.reply("*Uso:* _/ban_ ou _/desban_ (id usuario)", { parse_mode: 'Markdown' });
        return;
    }

    try {
        const getUser = await ctx.telegram.getChat(id_telegram);
        const getUserDB = await User.findOne({ where: { id_telegram } });

        if (getUser && await getUserDB) {
            switch (command) {
                case 'ban':
                    await User.update({ status: 0 }, { where: { id_telegram } });
                    await ctx.reply(`Usuario *${getUser.first_name}* banido com sucesso. ID: ${getUserDB.id}`, { parse_mode: 'Markdown' });

                    // Envia para o usuario
                    await ctx.telegram.sendMessage(id_telegram, lang('you_banned', getUserDB.lang), { parse_mode: 'Markdown' });
                    break;
                case 'desban':
                    await User.update({ status: 1 }, { where: { id_telegram } });
                    await ctx.reply(`Usuario *${getUser.first_name}* desbanido com sucesso. ID: ${getUserDB.id}`, { parse_mode: 'Markdown' })

                    // Envia para o usuario
                    await ctx.telegram.sendMessage(id_telegram, lang('you_unbanned', getUserDB.lang), { parse_mode: 'Markdown' });
                    break;
                default:
                    ctx.reply("*Uso:* _/ban_ ou _/desban_ (id usuario)", { parse_mode: 'Markdown' });
            }
        }
    } catch (error) {
        console.error(error);
        ctx.reply("Ocorreu um erro ao obter dados do usuário.");
    }
}

module.exports = {
    getReport,
    banOrUnban
}