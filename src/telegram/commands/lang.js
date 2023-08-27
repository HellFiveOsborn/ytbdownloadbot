const { usuario, lang } = require('../../module/functions');

const langs = {
    pt: {
        id: 'pt',
        lang: '🇧🇷 PT-BR'
    },
    en: {
        id: 'en',
        lang: '🇺🇸 EN'
    },
    es: {
        id: 'es',
        lang: '🇪🇸 ES'
    }
};

/**
 * Setar o idioma
 * 
 * @param {import('telegraf').Context} ctx 
 * @param {import('better-sqlite3').Database} db 
 * @param {import('../../module/sessionmanager')} cache
 * @param {string} lang 
 */
const setLang = (ctx, db, cache, langKey) => {
    const chat_id = ctx.from.id;

    const updateDataSQL = `
        UPDATE usuarios
        SET lang = ?
        WHERE chat_id = ?
    `;

    db.prepare(updateDataSQL).run(langKey, chat_id);

    ctx.answerCbQuery(lang('selected_lang', langKey, { lang: langs[langKey].lang }));

    langsCmd(ctx, db, cache);
}

/**
 * Comando Lang
 * 
 * @param {import('telegraf').Context} ctx 
 * @param {import('better-sqlite3').Database} db 
 * @param {import('../../module/sessionmanager')} cache
 */
const langsCmd = (ctx, db, cache) => {
    const chat_id = ctx.from.id;

    const user = usuario(ctx)

    // Verifique se o usuário tem um idioma definido
    const langCode = user.hasOwnProperty('lang') ? user.lang : 'en';

    // Crie um array para armazenar os botões em duas linhas
    const keyboard = [[], []];

    // Loop pelas opções de idioma e crie um botão para cada uma
    Object.values(langs).map((lang, index) => {
        const rowIndex = Math.floor(index / 2); // Divide em duas linhas

        // Verifique se o idioma do usuário coincide com o idioma atual
        const isSelected = langCode === lang.id ? '● ' : '';

        keyboard[rowIndex].push({ text: isSelected + lang.lang, callback_data: `setlang ${lang.id}` });
    });

    // Crie o teclado inline com até 2 botões por linha
    const inlineKeyboard = {
        inline_keyboard: keyboard
    };

    try {
        ctx.editMessageText(lang('select_lang', langCode), {
            reply_markup: inlineKeyboard
        }).then((resp) => cache.update(chat_id, 'ultima_msg', resp.message_id))
            .catch(() => {
                ctx.reply(lang('select_lang', langCode), {
                    reply_markup: inlineKeyboard
                }).then((resp) => cache.update(chat_id, 'ultima_msg', resp.message_id));
            });
    } catch (error) {
        ctx.reply(lang('select_lang', langCode), {
            reply_markup: inlineKeyboard
        }).then((resp) => cache.update(chat_id, 'ultima_msg', resp.message_id));
    }
}

module.exports = {
    langsCmd,
    setLang
}