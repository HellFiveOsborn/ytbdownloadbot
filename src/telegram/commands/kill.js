const { usuario, killProcess, lang } = require('../../module/functions');
const SessionManager = require('../../module/sessionmanager');
const cache = new SessionManager();

/**
 * Comando kill
 * 
 * @param {import('telegraf').Context} ctx 
 */
module.exports = (ctx) => {
    const chat_id = ctx.from.id;
    const user = usuario(ctx)
    const langCode = user.hasOwnProperty('lang') ? user.lang : 'en';

    if (cache.exists(chat_id) && cache.existsKey(chat_id, 'queue')) {
        const dataCache = cache.get(chat_id);

        let listaPids = [];

        for (const item of Object.keys(dataCache)) {
            if (item == 'queue') {
                const queue = Object.keys(dataCache[item]);

                listaPids.push(...queue);
            } else if (item.startsWith('download_cache')) {
                delete dataCache[item];
            }
        }

        dataCache.queue = {};

        cache.update(chat_id, dataCache);

        killProcess(listaPids, async () => {
            ctx.reply(lang('finish_process', langCode));
        });
    }
};