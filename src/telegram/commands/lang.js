const { User } = require('../../../models');
const { lang, editReplyMarkupOrSend } = require('../../module/functions');

const langs = {
    pt: {
        id: 'pt-br',
        lang: '🇧🇷 PT-BR'
    },
    en: {
        id: 'en',
        lang: '🇺🇸 EN'
    },
    es: {
        id: 'es',
        lang: '🇪🇸 ES'
    },
    ru: {
        id: 'ru',
        lang: '🇷🇺 RU'
    },
    'zh-hans': {
        id: 'zh-hans',
        lang: '🇨🇳 CN'
    },
    ar: {
        id: 'ar',
        lang: '🇸🇦 AR'
    }
};

/**
 * Setar o idioma
 * 
 * @param {import('telegraf').Context} ctx 
 * @param {string} langKey 
 */
const setLang = async (ctx, langKey) => {
    const chat_id = ctx.from.id;

    await User.setLang(chat_id, langKey);
    await ctx.answerCbQuery(lang('selected_lang', langKey, {
        lang: Object.values(langs).filter(i => i.id == langKey)[0]?.lang
    }));

    await ctx.telegram.setMyCommands(lang('commands', langKey));

    await editReplyMarkupOrSend(ctx, ctx.msgId, lang('selected_lang', langKey, {
        lang: Object.values(langs).filter(i => i.id == langKey)[0]?.lang
    }), {}, false);
}

/**
 * Comando Lang
 * 
 * @param {import('telegraf').Context} ctx 
 */
const getLangs = async (ctx) => {
    const chat_id = ctx.from.id;
    const langCode = await User.getLang(chat_id);

    // Crie um array para armazenar os botões em duas linhas
    const keyboard = [[], []];
    Object.values(langs).map((lang, index) => {
        const rowIndex = Math.floor(index / 2);
        const isSelected = langCode === lang.id ? '● ' : '';

        if (!keyboard[rowIndex]) {
            keyboard[rowIndex] = [];
        }

        keyboard[rowIndex].push({
            text: isSelected + lang.lang,
            callback_data: `setlang ${lang.id}`
        });
    });

    // Crie o teclado inline com até 2 botões por linha
    const replyMarkupParams = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: keyboard
        }
    };

    const text = lang('select_lang', langCode);
    await ctx.reply(text, replyMarkupParams);
}

module.exports = {
    getLangs,
    setLang
}