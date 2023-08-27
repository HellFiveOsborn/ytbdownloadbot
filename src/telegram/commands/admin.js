const Database = require('better-sqlite3');
const { env, resolve_path, usuario, banOrUnban } = require('../../module/functions');
const SessionManager = require('../../module/sessionmanager');
const cache = new SessionManager();

const db = new Database(resolve_path('database/bot.sqlite'));

/**
 * Obtem o total de usuários
 * 
 * @param {import('telegraf').Context} ctx 
 */
const getTotalUsuarios = async (ctx) => {
    const chat_id = ctx.from.id;

    // Verifique se o usuário é um administrador 
    if (chat_id !== env('admin')) {
        return;
    }

    try {
        const query = "SELECT COUNT(*) as total FROM usuarios";
        const result = db.prepare(query).get();

        if (result && result.total) {
            const totalUsuarios = result.total;
            ctx.reply(`Há *${totalUsuarios} usuários* no bot`, { parse_mode: 'Markdown' });
        } else {
            ctx.reply("Não foi possível obter o total de usuários.");
        }
    } catch (error) {
        console.error(error);
        ctx.reply("Ocorreu um erro ao obter o total de usuários.");
    }
}

/**
 * Obtem o total de músicas
 * 
 * @param {import('telegraf').Context} ctx 
 */
const getTotalMusicas = async (ctx) => {
    const chat_id = ctx.from.id;

    // Verifique se o usuário é um administrador 
    if (chat_id !== env('admin')) {
        return;
    }

    try {
        const query = "SELECT COUNT(*) as total FROM musicas";
        const result = db.prepare(query).get();

        if (result && result.total) {
            const totalUsuarios = result.total;
            ctx.reply(`Há *${totalUsuarios} músicas* baixadas pelo bot`, { parse_mode: 'Markdown' });
        } else {
            ctx.reply("Não foi possível obter o total de músicas.");
        }
    } catch (error) {
        console.error(error);
        ctx.reply("Ocorreu um erro ao obter o total de músicas.");
    }
}

/**
 * Obtem o total de músicas
 * 
 * @param {import('telegraf').Context} ctx 
 */
const banirOuDesbanirUsuario = async (ctx) => {
    const chat_id = ctx.from.id;
    const text = ctx.message.text.split(' ')
    const id = text[1];

    // Verifique se o usuário é um administrador
    if (chat_id !== env('admin')) {
        return;
    }

    try {
        const user = await ctx.getChatMember(id);

        if (user && usuario(ctx)) {
            if (text[0] == '/ban') {
                if (banOrUnban(id, true) === 0) {
                    ctx.reply(`Usuario ${user.user.first_name} banido com sucesso. ID: ${id}`);
                }
            }

            if (text[0] == '/desban') {
                if (banOrUnban(id, false) === 1) {
                    ctx.reply(`Usuario ${user.user.first_name} desbanido com sucesso. ID: ${id}`);
                }
            }
        }
    } catch (error) {
        ctx.reply("Ocorreu um erro ao obter dados do usuário.");
    }
}

module.exports = {
    getTotalUsuarios,
    getTotalMusicas,
    banirOuDesbanirUsuario
}