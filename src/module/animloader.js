const SessionManager = require('./sessionmanager');

class AnimLoaderWrapper {
    constructor(ctx, emojis, message, bot, callback) {
        this.ctx = ctx;
        this.emojis = emojis;
        this.message = message;
        this.bot = bot;
        this.cache = new SessionManager('../../database.db');
        this.intervalProcess = new Map();
        this.callback = callback;
        this.callbackResult = null; // Variável para armazenar o resultado do callback
        this.started = false; // Indica se o animloader já foi iniciado
        this.onCompleteCalled = false; // Variável para controlar se onComplete já foi chamado
    }

    async start() {
        if (this.started) {
            throw new Error('AnimLoaderWrapper já foi iniciado.');
        }

        this.started = true;

        const chat_id = this.ctx.message.chat.id;
        const response = await this.bot.telegram.sendMessage(chat_id, `${this.emojis[0]} ${this.message}`);
        const dataCache = { ultima_msg: response, interval: null };

        // Salva no cache.
        this.cache.set(chat_id, dataCache);

        let i = 0;
        let maxTimes = 40; // 40 times = 1m no máximo
        let interval;
        let elapsedTime = 0; // Tempo decorrido

        const checkCallback = async () => {
            if (this.onCompleteCalled) return;

            if (this.callback && typeof this.callback === 'function') {
                this.callbackResult = await this.callback(this.ctx);

                if (this.callbackResult !== null) {
                    clearInterval(interval);
                    this.onCompleteCallback(this.ctx, this.callbackResult);
                    this.onCompleteCalled = true;
                }
            }
        };

        checkCallback();

        interval = setInterval(async () => {
            i = (i + 1) % this.emojis.length;
            elapsedTime += 1500;

            try {
                const response = await this.bot.telegram.editMessageText(dataCache.ultima_msg.chat.id, dataCache.ultima_msg.message_id, undefined, `${this.emojis[i]} ${this.message}`);
                dataCache.ultima_msg = response;
            } catch (err) {
                if (err) {
                    console.error(err);
                    return;
                }
            }

            if (elapsedTime >= maxTimes * 1500) {
                clearInterval(interval);
                await this.bot.telegram.sendChatAction(chat_id, 'typing');
            }
        }, 1500);

        const execId = `process_${chat_id}_${interval}`;
        this.intervalProcess.set(execId, interval);

        this.cache.set(chat_id, { ...dataCache, interval: execId });

        return this;
    }

    async stop() {
        if (!this.started) {
            throw new Error('AnimLoaderWrapper não foi iniciado.');
        }

        const chat_id = this.ctx.message.chat.id;
        const dataCache = this.cache.get(chat_id);

        if (dataCache && dataCache.ultima_msg && dataCache.ultima_msg.chat && dataCache.ultima_msg.message_id) {
            const intervalID = this.intervalProcess.get(dataCache.interval);
            clearInterval(intervalID);
            this.intervalProcess.delete(dataCache.interval);

            await this.bot.telegram.deleteMessage(dataCache.ultima_msg.chat.id, dataCache.ultima_msg.message_id);

            this.cache.delete(chat_id, 'ultima_msg');
            this.cache.delete(chat_id, 'interval');
        } else {
            console.error('Não foi possível parar o animloader, pois dataCache.ultima_msg é indefinido ou não possui as propriedades necessárias.');
        }
    }

    onComplete(callback) {
        if (typeof callback === 'function') {
            this.onCompleteCallback = callback;
        } else if (this.onCompletePromise === null) {
            this.onCompletePromise = new Promise((resolve) => {
                this.onCompleteCallback = (ctx, data) => {
                    resolve(data);
                };
            });
        }
        return this; // Retorna a própria instância para encadeamento
    }
}

const animloader = (ctx, { emojis, message }, bot, callback) => {
    return new AnimLoaderWrapper(ctx, emojis, message, bot, callback);
}

module.exports = animloader;
