const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const { spawn } = require('child_process');
const path = require('path');
const redisClient = require('./redisClient');

/**
 * Captura o tipo de update (usuário, canal, grupo) a partir do contexto.
 * 
 * @param {import('telegraf').Context} ctx 
 * @returns {string|null} - O tipo de update ("private" para usuário, "channel" para canal, "group" para grupo).
 */
function updateTypeOrigin(ctx) {
    switch (ctx.updateType) {
        case 'message':
        case 'edited_message':
        case 'callback_query':
            return ctx.message?.chat.type || ctx.callbackQuery?.message.chat.type;
        case 'inline_query':
        case 'chosen_inline_result':
            return 'inline';
        case 'channel_post':
        case 'edited_channel_post':
            return 'channel';
        case 'shipping_query':
        case 'pre_checkout_query':
            return 'shopping';
        case 'poll':
        case 'poll_answer':
            return 'poll';
        case 'chat_member':
        case 'my_chat_member':
        case 'chat_join_request':
            return 'chat_member';
        default:
            return null;
    }
}

/**
 * Verifica assincronamente se o usuário está no grupo e/ou canal especificados pelas variáveis de ambiente.
 * Se ambas as variáveis JOIN_GROUP e JOIN_CHANNEL estiverem definidas, é obrigatório estar em ambos.
 * Se apenas uma estiver definida, verifica somente a definida.
 * @param {import('telegraf').Context} ctx - O contexto Telegraf.
 * @returns {Promise<boolean>} Retorna true se o usuário for membro do grupo ou canal especificado, false caso contrário.
 */
async function isUserInGroupOrChannel(ctx) {
    const checkMembership = async (chatId) => {
        if (!chatId) return false;
        const status = ['left', 'restricted', 'kicked'];
        const memberStatus = await ctx.telegram.getChatMember(chatId, ctx.from.id);
        return memberStatus && !status.includes(memberStatus.status);
    };

    const groupId = env('JOIN_GROUP'), channelId = env('JOIN_CHANNEL');
    const groupCheck = await checkMembership(groupId);
    const channelCheck = await checkMembership(channelId);

    return groupId && channelId ? groupCheck && channelCheck : groupCheck || channelCheck;
}

/**
 * Tenta editar uma mensagem existente, e se não for possível, envia uma nova mensagem.
 * @param {import('telegraf').Context} ctx - O contexto Telegraf.
 * @param {number} messageId - O ID da mensagem a ser editada (ou 0 para enviar uma nova mensagem).
 * @param {string} text - O texto da mensagem.
 * @param {import('telegraf/typings/telegram-types').ExtraEditMessageText} extraParams - Parâmetros extras para a mensagem (por exemplo, parse_mode).
 * @param {boolean} useCache - Se verdadeiro, tenta obter e salvar o messageId no Redis.
 * @param {string} customCacheKey - O nome do cache para salvar o messageId.
 * @returns {Promise<object>} - O ID da mensagem editada ou da nova mensagem enviada.
 */
async function editOrSendMessage(ctx, messageId = null, text, extraParams = {}, useCache = false, customCacheKey = null) {
    const chatId = ctx.chat.id;
    const cacheKey = useCache && customCacheKey != null ? customCacheKey : `LAST_MSG:${chatId}`;
    let resultMessage;

    if (!extraParams.hasOwnProperty('parse_mode')) {
        extraParams.parse_mode = 'Markdown';
    }

    if (useCache && messageId === null) {
        messageId = await redisRecovery(cacheKey);
    }

    try {
        resultMessage = await ctx.telegram.editMessageText(chatId, messageId, null, text, extraParams);
    } catch (error) {
        resultMessage = await ctx.reply(text, extraParams);
        Logger.save(error, 'error');
    }

    if (useCache) {
        await redisClient.setEx(cacheKey, 60, resultMessage?.message_id.toString());
    }

    return resultMessage;
}

/**
 * Edita o texto e/ou a marcação de resposta de uma mensagem existente. Se a mensagem não existir, envia uma nova.
 * @param {import('telegraf').Context} ctx - O contexto Telegraf.
 * @param {number|null} messageId - O ID da mensagem a ser editada. Se for null, uma nova mensagem será enviada.
 * @param {string} text - O texto da mensagem para novas mensagens.
 * @param {import('telegraf/typings/telegram-types').ExtraEditMessageText} extraParams - Parâmetros extras para a mensagem ou marcação de resposta (inclui inline_keyboard no markup).
 * @param {boolean} useCache - Se verdadeiro, tenta obter e salvar o messageId no Redis.
 * @param {string} customCacheKey - O nome do cache para salvar o messageId.
 * @returns {Promise<object>} - O resultado da mensagem editada ou da nova mensagem enviada.
 */
async function editReplyMarkupOrSend(ctx, messageId = null, text, extraParams = {}, useCache = false, customCacheKey = null) {
    const chatId = ctx.chat.id;
    const cacheKey = useCache && customCacheKey != null ? customCacheKey : `LAST_MSG:${chatId}`;
    let resultMessage;

    extraParams.parse_mode = extraParams.parse_mode || 'Markdown';

    if (useCache && messageId === null) {
        messageId = await redisClient.get(cacheKey); // Tentativa de obter o messageId do cache
    }

    resultMessage = await editOrSendMessage(ctx, messageId, text, { ...extraParams, reply_markup: ctx.callbackQuery?.message?.reply_markup || {} }, true, customCacheKey)
        .then(async (response) => await ctx.editMessageReplyMarkup(extraParams.reply_markup));

    if (useCache) {
        await redisClient.setEx(cacheKey, 60, resultMessage.message_id.toString());
    }

    return resultMessage;
}

/**
 * Tenta enviar uma foto usando sendPhoto. Se não for possível, envia uma mensagem com um link que cria um preview da imagem.
 * @param {import('telegraf').Context} ctx - O contexto Telegraf.
 * @param {string} photoUrl - A URL da foto.
 * @param {object} extraParams - Opções adicionais para a mensagem, como caption, parse_mode, etc.
 * @returns {Promise<number>} - O ID da mensagem enviada.
 */
async function sendPhotoOrMessage(ctx, photoUrl, extraParams = {}) {
    extraParams.parse_mode = extraParams.parse_mode || 'Markdown';

    try {
        // Tenta enviar a foto
        return await ctx.telegram.sendPhoto(ctx.chat.id, photoUrl, extraParams);
    } catch (error) {
        Logger.save(error, 'error');
        // Se a foto não puder ser enviada, envia como mensagem com link da foto
        const photoLink = extraParams.parse_mode === 'HTML' ? `<a href="${photoUrl}">&#8203;</a>` : `[&#8203;](${photoUrl})`;
        const messageText = (extraParams.caption ? extraParams.caption + ' ' : '') + photoLink;
        return await ctx.telegram.sendMessage(ctx.chat.id, messageText, extraParams);
    }
}

/**
 * Envia um áudio ou vídeo com opções personalizadas e suporta botões inline.
 * @param {import('telegraf').Context} ctx - O contexto da mensagem.
 * @param {string} fileSource - A fonte do arquivo (URL ou caminho do arquivo local).
 * @param {import('telegraf/typings/telegram-types').ExtraVideo | import('telegraf/typings/telegram-types').ExtraAudio} extraParams - Opções personalizadas para a mensagem.
 * @param {string} [extraParams.caption] - Legenda da mensagem.
 * @param {string} [extraParams.parse_mode] - Modo de formatação da mensagem.
 * @param {number} [extraParams.duration] - Duração do áudio/vídeo.
 * @param {string} [extraParams.performer] - Intérprete do áudio.
 * @param {string} [extraParams.title] - Título do áudio.
 * @param {number} [extraParams.width] - Largura do vídeo.
 * @param {number} [extraParams.height] - Altura do vídeo.
 * @param {boolean} [extraParams.supports_streaming] - Se o vídeo suporta streaming.
 * @param {boolean} [extraParams.thumbnail.source] - Thumbnail para audios.
 * @returns {Promise} Uma promessa que é resolvida quando a mensagem é enviada.
 */
async function sendAudioOrVideo(ctx, fileSource, extraParams = {}) {
    const isFileId = typeof fileSource === 'string' && !fileSource.includes('.');
    let method, chatAction;
    if (isFileId) {
        method = 'sendAudio', chatAction = 'upload_voice';
    } else {
        const ext = fileSource.slice(-4).toLowerCase();
        if (['.mp3', '.m4a', '.wav'].includes(ext)) method = 'sendAudio', chatAction = 'upload_voice';
        else if (['.mp4', '.mkv'].includes(ext)) method = 'sendVideo', chatAction = 'upload_video';
        else throw new Error('Tipo de arquivo não suportado.');
    }

    try {
        let response;

        await ctx.sendChatAction(chatAction)
            .then(async () => {
                extraParams.parse_mode = extraParams.parse_mode || 'Markdown';
                const payload = isFileId ? fileSource : { source: fileSource };
                response = await ctx.telegram[method](ctx.chat.id, payload, extraParams);
            });

        return response;
    } catch (error) {
        Logger.save(error, 'error');
        throw error;
    }
}

/**
 * FUNÇÕES HELPER
 */

/**
 * Pausa a execução por um período de tempo especificado.
 * @param {number} ms - O número de milissegundos para pausar a execução.
 * @returns {Promise<void>} - Uma promessa que é resolvida após a pausa.
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Armazena ou busca um valor no Redis, com suporte opcional a expiração.
 * 
 * @param {string} key Chave sob a qual o valor será armazenado ou buscado no Redis.
 * @param {Function} callback Função que retorna o valor a ser armazenado caso não exista no Redis.
 * @param {number|Date|null} expiration Expiração do cache em segundos, uma instância de Date, ou null para sem expiração.
 * @returns {Promise<any>} O valor buscado do cache ou o valor retornado pelo callback.
 */
async function redisRemember(key, callback, expiration = null) {
    let cachedValue = await redisClient.get(key);
    if (cachedValue) {
        try {
            return JSON.parse(cachedValue);
        } catch {
            return cachedValue;
        }
    }
    const value = await callback();
    const valueToStore = typeof value === 'object' ? JSON.stringify(value) : value;
    if (expiration) {
        if (expiration instanceof Date) {
            expiration = Math.ceil((expiration.getTime() - Date.now()) / 1000);
        }
        await redisClient.setEx(key, expiration, valueToStore);
    } else {
        await redisClient.set(key, valueToStore);
    }
    return value;
}

/**
 * Recupera um valor associado a uma chave do Redis. Se o valor for um JSON, realiza o parse.
 * Retorna `null` caso a chave não exista.
 * 
 * @param {string} key Chave usada para buscar o valor no Redis.
 * @returns {Promise<any|null>} Promessa que resolve com o valor recuperado e parseado do Redis, ou `null` se a chave não existir.
 */
async function redisRecovery(key) {
    const cachedValue = await redisClient.get(key);
    if (!cachedValue) {
        return null;
    }
    try {
        return JSON.parse(cachedValue);
    } catch {
        return cachedValue;
    }
}

/**
 * Gerencia uma lista de PIDs em um conjunto Redis associado a uma chave personalizada.
 * 
 * @param {string} customKey Chave personalizada para identificar o conjunto de PIDs no Redis.
 * @returns {{
 *   add: (pid: string) => Promise<number>, 
 *   rem: (pid: string) => Promise<number>, 
 *   all: () => Promise<string[]>, 
 *   count: () => Promise<number>, 
 *   reset: () => Promise<void>
 * }} Objeto contendo métodos para manipular a lista de PIDs: adicionar, remover, listar todos, contar e resetar.
 */
function redisProcesses(customKey) {
    return {
        add: async (pid) => await redisClient.sAdd(customKey, pid.toString()),
        rem: async (pid) => await redisClient.sRem(customKey, pid.toString()),
        all: async () => await redisClient.sMembers(customKey),
        count: async () => await redisClient.sCard(customKey),
        reset: async () => await redisClient.del(customKey)
    };
}

/**
 * Função para obter e converter valores de variáveis de ambiente.
 *
 * @param {string} key - A chave da variável de ambiente.
 * @returns {string|number|object|array|null|undefined} - O valor convertido da variável de ambiente,
 * ou null se o valor numérico for NaN, ou undefined se a variável não estiver definida.
 */
function env(key) {
    const envValue = process.env[key];
    if (envValue === undefined) return undefined;

    try {
        // Tenta parsear como JSON se inicia com '[' ou '{'
        if (/^\[|{/.test(envValue)) return JSON.parse(envValue);
    } catch (error) {
        // Retorna o valor como string se o JSON.parse falhar
    }

    // Tenta converter para número, retorna null se for NaN
    const numberValue = Number(envValue);
    return isNaN(numberValue) ? envValue : numberValue;
}

class Logger {
    static save(...args) {
        const reset = '\x1b[0m', red = '\x1b[31m', green = '\x1b[32m', yellow = '\x1b[33m', blue = '\x1b[34m';
        const colors = { error: red, info: green, warn: yellow, debug: blue, default: reset };
        const logType = env('LOG_TYPE') || 'file';
        const basePath = path.join(resolve_path('src'), 'logs');

        let level = 'default';
        if (typeof args[args.length - 1] === 'object' && args[args.length - 1].level) {
            level = args.pop().level;
        }

        // Combina todas as mensagens em uma única string
        const combinedMessage = args.flat().map(msg => typeof msg === 'object' ? JSON.stringify(msg, null, 2) : msg).join(' | ');

        const channel = level;
        const filePath = path.join(basePath, `${channel}.log`);
        const headerLog = `[${new Date().toISOString()}] ${channel.toUpperCase()}: `;
        const color = colors[level] || reset;

        if (logType === 'file') {
            if (!fs.existsSync(basePath)) fs.mkdirSync(basePath);
            if (fs.existsSync(filePath) && fs.statSync(filePath).size >= 35 * 1024 * 1024) {
                fs.renameSync(filePath, `${filePath}.${new Date().toISOString().replace(/[:.]/g, '-')}`);
            }
            fs.appendFileSync(filePath, `${headerLog}${combinedMessage}\n`);
        } else if (logType === 'unix') {
            console.log(`${headerLog}${color}${combinedMessage}${reset}`);
        } else {
            console.error(`${red}Tipo de log não suportado: ${logType}${reset}`);
        }
    }

    static getCallerDetails() {
        const stack = new Error().stack;
        const stackLines = stack.split('\n');
        const callerLine = stackLines[3];
        if (!callerLine) return 'Caller details not available';
        const match = callerLine.match(/at (.*?) \((.*?):(\d+):(\d+)\)$/);
        return match ? `${match[1]} ${match[2]} Line ${match[3]}` : callerLine;
    }

    static error(...args) { this.save(...args, { level: 'error' }); }
    static info(...args) { this.save(...args, { level: 'info' }); }
    static warn(...args) { this.save(...args, { level: 'warn' }); }
    static debug(...args) { this.save(...args, { level: 'debug' }); }
}

/**
 * Retorna uma string traduzida de acordo com a chave e o idioma fornecidos.
 * @param {string} key - A chave para obter a tradução.
 * @param {string} [lang='en'] - O idioma desejado.
 * @param {object} [replacements={}] - Um objeto contendo valores para substituir os placeholders na tradução.
 * @returns {string} - A string traduzida.
 */
function lang(key, lang = 'en', replacements = {}) {
    const langsFilePath = resolve_path(`langs/${lang}.json`);
    let translations = {};

    try {
        const langsFileContent = fs.readFileSync(langsFilePath, 'utf8');
        translations = JSON.parse(langsFileContent);
    } catch (error) {
        Logger.save({ message: 'Erro ao ler o arquivo de traduções', error }, 'error');
        const langsFileContent = fs.readFileSync(resolve_path(`langs/en.json`), 'utf8');
        translations = JSON.parse(langsFileContent);
    }

    // Acessa subtraduções baseadas no caminho especificado em "key"
    const keys = key.split('.');
    let translation = keys.reduce((acc, k) => acc && acc[k] ? acc[k] : null, translations);

    // Se a chave apontar para um array, permita a sintaxe "chave:índice" para acessar um elemento específico
    if (translation === null && key.includes(':')) {
        const [arrayKey, index] = key.split(':');
        const arrayTranslation = keys.slice(0, -1).reduce((acc, k) => acc && acc[k] ? acc[k] : null, translations);

        translation = arrayTranslation ? arrayTranslation[arrayKey][parseInt(index)] : null;
    }

    // Se a tradução for um objeto ou array, retorna a string JSON do objeto/array
    if (typeof translation === 'object') {
        translation = JSON.stringify(translation);
    }

    // Substitui os placeholders na tradução, se houver substituições
    if (translation && Object.keys(replacements).length > 0) {
        for (const placeholder in replacements) {
            const replacementValue = replacements[placeholder];
            const placeholderRegex = new RegExp(`:${placeholder}`, 'g');
            translation = translation.replace(placeholderRegex, replacementValue);
        }
    }

    return translation || key; // Retorna a tradução ou a chave original se não houver tradução
}

function friendlyDate(d, langCode = 'en') {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const inputDate = new Date(d.slice(0, 4), d.slice(4, 6) - 1, d.slice(6));
    const diff = (now - inputDate) / (1000 * 60 * 60 * 24);

    if (diff < 1 && now.getDate() === inputDate.getDate()) {
        return lang("calendar_to_human.today", langCode);
    } else if (diff >= 1 && diff < 2) {
        return lang("calendar_to_human.yesterday", langCode);
    } else if (diff >= 2 && diff < 3) {
        return lang("calendar_to_human.the_day_before_yesterday", langCode);
    } else if (diff >= 3 && diff < 7) {
        return lang("calendar_to_human.day", langCode, { days: Math.floor(diff) });
    } else if (diff >= 7 && diff < 30) {
        const week = Math.floor(diff / 7);
        return lang("calendar_to_human.week", langCode, { week });
    } else if (diff >= 30 && diff < 365) {
        const month = Math.floor(diff / 30);
        return lang("calendar_to_human.month", langCode, { month });
    } else {
        const year = Math.floor(diff / 365);
        return lang("calendar_to_human.year", langCode, { year });
    }
}

function resolve_path(searchPath) {
    const rootPath = path.dirname(require.main.filename);
    const searchQueue = [rootPath];
    const results = [];

    const parsedSearchPath = searchPath.includes('/') ? searchPath.split('/') : [searchPath];

    while (searchQueue.length > 0) {
        const currentPath = searchQueue.shift();

        if (currentPath.includes('node_modules')) {
            continue; // Ignora a pasta 'node_modules'
        }

        const items = fs.readdirSync(currentPath, { withFileTypes: true });

        for (const item of items) {
            const itemName = item.name;
            const itemPath = path.join(currentPath, itemName);

            if (item.isDirectory()) {
                searchQueue.push(itemPath);
                if (parsedSearchPath.length === 1 && parsedSearchPath[0] === itemName) {
                    results.push(itemPath);
                }
            } else if (item.isFile()) {
                if (itemName === parsedSearchPath[parsedSearchPath.length - 1]) {
                    results.push(itemPath);
                } else {
                    const itemWithoutExtension = path.parse(itemName).name;
                    if (itemWithoutExtension === parsedSearchPath[parsedSearchPath.length - 1]) {
                        results.push(itemPath);
                    }
                }
            }
        }
    }

    if (results.length === 0) {
        return null;
    } else if (results.length === 1) {
        return results[0];
    } else {
        return results;
    }
}

/**
 * Chama uma função de comando.
 * 
 * @param {string} command - O nome do comando a ser executado.
 * @param {import('telegraf').Context} ctx - O contexto da mensagem.
 * @param {string} functionName - O nome da função a ser executada.
 * @param  {...any} args - Os argumentos a serem passados à função.
 * @returns 
 */
async function callCommand(command, ctx, functionName, ...args) {
    try {
        const commandModule = require(`../telegram/commands/${command}`);
        if (functionName && typeof commandModule[functionName] === 'function') {
            return await commandModule[functionName](ctx, ...args);
        } else if (typeof commandModule === 'function') {
            return await commandModule(ctx, ...args);
        } else {
            throw new Error('Função não encontrada.');
        }
    } catch (error) {
        Logger.error(`Erro ao executar o comando`, error), console.error(error);

        if (ctx.updateType === 'message') {
            // Envia uma mensagem genérica de erro ao usuário
            await ctx.reply('😣 An error occurred while executing the command. Please try again later.');
        }
    }
}

/**
 * Gera links de convite para um grupo e/ou canal se configurados nas variáveis de ambiente.
 * 
 * @param {import('telegraf').Context} ctx - Contexto do Telegraf para acesso às funções do Telegram.
 * @returns {Promise<string>} Uma string contendo os links de convite formatados com Markdown.
 */
async function getInviteLinks(ctx) {
    const links = await Promise.all([
        env('JOIN_GROUP') ? redisRemember(`INVITE_LINK_EXPORT:${env('JOIN_GROUP')}`, async () => ctx.telegram.exportChatInviteLink(env('JOIN_GROUP')).then(link => `[👥 Group](${link})`)) : null,
        env('JOIN_CHANNEL') ? redisRemember(`INVITE_LINK_EXPORT:${env('JOIN_CHANNEL')}`, async () => ctx.telegram.exportChatInviteLink(env('JOIN_CHANNEL')).then(link => `[📢 Channel](${link})`)) : null,
    ]).then(results => results.filter(Boolean).join(' | '));

    return links;
}

function shortText(text, size) {
    if (text.length <= size) {
        return text;
    }
    let shortened = text.substr(0, size + 1).trim();

    let lastSpace = shortened.lastIndexOf(' ');
    if (lastSpace > -1) {
        shortened = shortened.substr(0, lastSpace);
    }

    return shortened + '...';
}

const shortNumerals = n => n < 1e3 ? `${n}` : n < 1e6 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k` : n < 1e9 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`;

const formatFilename = (filename) => {
    const accentsMap = {
        á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u',
        à: 'a', è: 'e', ì: 'i', ò: 'o', ù: 'u',
        ã: 'a', õ: 'o', â: 'a', ê: 'e', î: 'i', ô: 'o', û: 'u',
        ç: 'c', ü: 'u', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U',
        À: 'A', È: 'E', Ì: 'I', Ò: 'O', Ù: 'U',
        Ã: 'A', Õ: 'O', Â: 'A', Ê: 'E', Î: 'I', Ô: 'O', Û: 'U',
        Ç: 'C', Ü: 'U'
    };

    let extension = '';
    let baseName = filename;
    const dotIndex = filename.lastIndexOf('.');

    // Se houver uma extensão, separa-a do resto do nome
    if (dotIndex > -1) {
        extension = filename.substring(dotIndex);
        baseName = filename.substring(0, dotIndex);
    }

    let cleanBaseName = baseName
        .split('')
        .map(char => accentsMap[char] || char)
        .join('')
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remove caracteres especiais, mantendo espaços
        .trim()                         // Remove espaços extras no início e no fim
        .replace(/\s+/g, '_');          // Substitui espaços por underscores

    // Se o nome base limpo ficar vazio, usa 'Unknow_name'
    if (!cleanBaseName) {
        cleanBaseName = 'Unknow_name';
    }

    // Junta o nome base limpo com a extensão
    return cleanBaseName + extension;
};

/**
 * Envia uma requisição HTTP/HTTPS com suporte a GET e POST.
 *
 * @param {string} endpoint - O endpoint da requisição.
 * @param {'POST'|'GET'} method - O método da requisição.
 * @param {Object} [data={}] - Dados a serem enviados na requisição.
 * @param {Object} [headers={}] - Cabeçalhos da requisição.
 * @returns {{
 *     httpCode: number,
 *     headers: Object,
 *     body: Object|string
 * }} - Uma promessa que resolve com a resposta da requisição.
 */
async function curlRequest(endpoint, method, data = {}, headers = {}) {
    let url = new URL(endpoint);

    // Se o método for GET e existirem dados, converte-os em query strings
    if (method === 'GET' && Object.keys(data).length > 0) {
        url.search = new URLSearchParams(data).toString();
    }

    const init = { method, headers };

    // Se existir 'input_file', prepara o corpo da requisição como um stream
    if (data.input_file) {
        const stats = fs.statSync(data.input_file);
        headers['Content-Length'] = stats.size;
        headers['Content-Type'] = 'application/octet-stream';
        init.body = fs.createReadStream(data.input_file);
    } else if (method === 'POST' && Object.keys(data).length > 0 && !init.body) {
        // Para requisições POST sem 'input_file', envia os dados como JSON
        init.body = JSON.stringify(data);
        headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await fetch(url, init);
        const contentType = response.headers.get('content-type');
        let body;

        // Se a resposta for JSON, faz o parse automaticamente
        if (contentType && contentType.includes('application/json')) {
            body = await response.json();
        } else {
            body = await response.text();
        }

        return {
            httpCode: response.status,
            headers: response.headers.raw(),
            body
        };
    } catch (error) {
        Logger.save({ message: 'Request failed', error }, 'error');
        throw error;
    }
}

module.exports = {
    getInviteLinks,
    curlRequest,
    shortNumerals,
    shortText,
    callCommand,
    friendlyDate,
    resolve_path,
    env,
    Logger,
    formatFilename,
    lang,
    editOrSendMessage,
    editReplyMarkupOrSend,
    sendPhotoOrMessage,
    sendAudioOrVideo,
    isUserInGroupOrChannel,
    updateTypeOrigin,
    sleep,
    redisRemember,
    redisRecovery,
    redisProcesses,
}
