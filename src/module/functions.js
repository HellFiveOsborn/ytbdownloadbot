const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const db = new Database(resolve_path('database/bot.sqlite'));

/**
 * FUNÇÕES DATABASE
 */

/**
 * Função para adicionar +1 download a uma música
 * 
 * @param {import('better-sqlite3').Database} db 
 * @param {string} fileId 
 * @returns {integer}
 */
function incDownload(fileId) {
    // Atualize o número de downloads diretamente no banco de dados usando uma única instrução SQL
    const result = db.prepare(`
        UPDATE musicas
        SET downloads = downloads + 1
        WHERE file_id = ?
    `).run(fileId);

    // Verifique se a atualização foi bem-sucedida e retorne o novo total de downloads
    if (result.changes > 0) {
        const totalDownloads = db.prepare(`
            SELECT downloads
            FROM musicas
            WHERE file_id = ?
        `).get(fileId);

        return totalDownloads ? totalDownloads.downloads : 0;
    }

    return 0; // Se a atualização não foi bem-sucedida, retorne 0
}

function saveAudioDb(chatId, userId, fileId, ytbId, metadata, capaPath) {
    try {
        // Ler a imagem da capa em um buffer
        const capaBuffer = fs.readFileSync(capaPath);

        // Converter o buffer da capa para base64
        const capaBase64 = capaBuffer.toString('base64');

        // Prepare a inserção na tabela "musicas"
        const stmt = db.prepare(`
            INSERT INTO musicas (chat_id, user_id, file_id, ytb_id, downloads, metadata, thumbnail, registro)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Executar a inserção
        stmt.run(chatId, userId, fileId, ytbId, 1, JSON.stringify(metadata), capaBase64, new Date().toISOString());

        return true; // Retorna true se a inserção for bem-sucedida
    } catch (error) {
        console.error("Erro ao registrar áudio na tabela 'musicas':", error);
        return false; // Retorna false em caso de erro
    }
}
/**
 * Banir ou desbanir um chat_id.
 * 
 * @param {number} chat_id O ID do chat a ser banido ou desbanido
 * @param {boolean} ban Define se o chat deve ser banido (true) ou desbanido (false)
 * @returns {number} O novo status (0 para banido, 1 para desbanido)
 */
function banOrUnban(chat_id, ban = false) {
    try {
        // Determine o novo status com base na ação de banir ou desbanir
        const newStatus = ban ? 0 : 1;

        // Atualize o status do chat_id no banco de dados
        db.prepare('UPDATE usuarios SET status = ? WHERE chat_id = ?').run(newStatus, chat_id);

        return newStatus;
    } catch (error) {
        console.error(error);
        return -1; // Retorne -1 em caso de erro
    }
}

/**
 * FUNÇÕES EXTENDS TELEGRAM
 */

/**
 * Captura o tipo de update (usuário, canal, grupo) a partir do contexto.
 * 
 * @param {import('telegraf').Context} ctx 
 * @returns {string} - O tipo de update ("private" para usuário, "channel" para canal, "group" para grupo).
 */
function updateTypeOrigin(ctx) {
    const updateType = ctx.updateType;

    if (updateType === 'message') {
        if (ctx.message.chat.type === 'private') {
            return 'private'; // Usuário
        } else if (ctx.message.chat.type === 'channel_post') {
            return 'channel'; // Canal
        } else if (ctx.message.chat.type === 'group') {
            return 'group'; // Grupo
        }
    } else if (updateType === 'channel_post') {
        return 'channel';
    } else if (updateType === 'callback_query') {
        if (ctx.callbackQuery.message.chat.type === 'private') {
            return 'private'; // Usuário
        } else if (ctx.callbackQuery.message.chat.type === 'channel_post') {
            return 'channel'; // Canal
        } else if (ctx.callbackQuery.message.chat.type === 'group') {
            return 'group'; // Grupo
        }
    }

    return null; // Tipo desconhecido
}

/**
 * Verifica se o usuário está em um grupo ou canal.
 * @param {import('telegraf').Context} ctx - O contexto Telegraf.
 * @param {number} userId - O ID do usuário a ser verificado.
 * @returns {boolean} Uma função de retorno que recebe um argumento booleano (true se o usuário estiver no grupo/canal, caso contrário, false).
 */
async function isUserInGroupOrChannel(ctx) {
    const chat_id = env('canais_permitidos')[0];
    const chatMember = await ctx.telegram.getChatMember(chat_id, ctx.from.id);
    const isMember = chatMember && chatMember.status !== 'left' && chatMember.status !== 'kicked';

    return isMember;
}

/**
 * Verifica se o usuário já existe no banco de dados e retorna seus dados se necessário.
 * 
 * @param {import('telegraf').Context} ctx 
 * @param {import('better-sqlite3').Database} db 
 * @returns {Object|null} - Os dados do usuário se existirem, caso contrário, null.
 */
function usuario(ctx) {
    // Verifica se o usuário é um usuário legítimo (não bot, canal ou grupo)
    if (updateTypeOrigin(ctx) === 'private') {
        const chat_id = ctx.from.id;
        const lang = ctx.from.language_code ?? 'en';

        // Verifica se o usuário já existe no banco de dados
        const user = db.prepare('SELECT * FROM usuarios WHERE chat_id = ?')
            .get(chat_id);

        if (!user) {
            // Se o usuário não existe, registra o novo usuário no banco de dados
            const result = db.prepare('INSERT INTO usuarios (chat_id, lang, registro, status) VALUES (?, ?, ?, ?)')
                .run(chat_id, lang, (new Date().toISOString()), 1);

            if (result.changes > 0) {
                // Registro bem-sucedido, agora obtenha os dados do usuário registrado
                return {
                    chat_id,
                    lang,
                    registro: (new Date().toISOString()),
                    status: 1
                };
            }
        }

        // Retorna os dados do usuário se existirem, caso contrário, retorna null
        return user || null;
    } else {
        // Se não for um usuário legítimo, retorna null
        return null;
    }
}

/**
 * Tenta editar uma mensagem existente, e se não for possível, envia uma nova mensagem.
 * @param {import('telegraf').Context} ctx - O contexto Telegraf.
 * @param {number} messageId - O ID da mensagem a ser editada (ou 0 para enviar uma nova mensagem).
 * @param {string} text - O texto da mensagem.
 * @param {object} extraParams - Parâmetros extras para a mensagem (por exemplo, parse_mode).
 * @returns {Promise<number>} - O ID da mensagem editada ou da nova mensagem enviada.
 */
async function editOrSendMessage(ctx, messageId = null, text, extraParams = {}) {
    if (!extraParams.hasOwnProperty('parse_mode')) {
        extraParams.parse_mode = 'Markdown';
    }
    try {
        if (messageId !== null) {
            // Tenta editar a mensagem existente
            const editedMessage = await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, text, { ...extraParams });
            return editedMessage.message_id;
        } else {
            // Se o messageId não for especificado ou for zero, envia uma nova mensagem
            const sentMessage = await ctx.telegram.sendMessage(ctx.chat.id, text, extraParams);
            return sentMessage.message_id;
        }
    } catch (error) {
        // Se a edição falhar, envia uma nova mensagem
        const sentMessage = await ctx.telegram.sendMessage(ctx.chat.id, text, extraParams);
        return sentMessage.message_id;
    }
}

/**
 * Tenta enviar uma foto usando sendPhoto. Se não for possível, envia uma mensagem com um link que cria um preview da imagem.
 * @param {import('telegraf').Context} ctx - O contexto Telegraf.
 * @param {string} photoUrl - A URL da foto.
 * @param {object} options - Opções adicionais para a mensagem, como caption, parse_mode, etc.
 * @returns {Promise<number>} - O ID da mensagem enviada.
 */
async function sendPhotoOrMessage(ctx, photoUrl, options = {}) {
    if (!options.hasOwnProperty('parse_mode')) {
        options.parse_mode = 'Markdown';
    }

    try {
        // Tenta enviar a foto usando sendPhoto
        const sentPhoto = await ctx.telegram.sendPhoto(ctx.chat.id, photoUrl, options);
        return sentPhoto.message_id;
    } catch (error) {
        // Se não for possível enviar a foto, cria um link de preview da imagem
        const photoLink = options.parse_mode ?
            options.parse_mode === 'HTML' ?
                `<a href="${photoUrl}">ㅤ</a>` : `[ㅤ](${photoUrl})`
            : `[ㅤ](${photoUrl})`;

        const caption = options.caption || '';

        const messageText = caption + photoLink;

        delete options.caption;

        const messageOptions = {
            ...options,
        };

        const sentMessage = await ctx.telegram.sendMessage(ctx.chat.id, messageText, messageOptions);

        return sentMessage.message_id;
    }
}

/**
 * Envia um áudio ou vídeo com opções personalizadas e suporta botões inline.
 * @param {import('telegraf').Context} ctx - O contexto da mensagem.
 * @param {string} fileSource - A fonte do arquivo (URL ou caminho do arquivo local).
 * @param {object} options - Opções personalizadas para a mensagem.
 * @returns {Promise} Uma promessa que é resolvida quando a mensagem é enviada.
 */
async function sendAudioOrVideo(ctx, fileSource, options = {}) {
    // Extensões suportadas para áudio e vídeo
    const audioExtensions = ['.mp3', '.m4a', '.wav'];
    const videoExtensions = ['.mp4', '.mkv'];

    // Verifica a extensão do arquivo
    const isAudio = audioExtensions.some(ext => fileSource.endsWith(ext));
    const isVideo = videoExtensions.some(ext => fileSource.endsWith(ext));

    const typing = isAudio ? 'upload_voice' : isVideo ? 'upload_video' : '';

    return ctx.persistentChatAction(typing, async () => {
        try {
            if (!options.hasOwnProperty('parse_mode')) {
                options.parse_mode = 'Markdown';
            }

            if (isVideo) {
                // Se for um vídeo, envie usando sendVideo
                return await ctx.telegram.sendVideo(ctx.chat.id, {
                    source: fileSource
                }, options);
            } else if (isAudio) {
                // Se for áudio, envie como áudio usando sendAudio
                return await ctx.telegram.sendAudio(ctx.chat.id, {
                    source: fileSource
                }, options);
            } else {
                // Trate outros tipos de arquivos aqui, se necessário
                throw new Error('Tipo de arquivo não suportado.');
            }
        } catch (error) {
            // Lida com erros aqui, se necessário
            saveLog(error, 'errors')
            throw error;
        }
    });
}


/**
 * Verifica se um usuário está banido com base no campo "status".
 * 
 * @param {import('telegraf').Context} ctx 
 * @param {import('better-sqlite3').Database} db 
 * @returns {boolean} - true se o usuário estiver banido, false caso contrário.
 */
function isBanned(ctx, db) {
    const userData = usuario(ctx)

    // Verifica se o usuário existe no banco de dados
    if (userData) {
        // Verifica se o usuário está banido com base no campo "status"
        return userData.status === 0;
    }

    // Se o usuário não existir, consideramos que ele não está banido
    return false;
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
 * Função para obter valores de variáveis de ambiente com conversão.
 *
 * @param {string} key - A chave da variável de ambiente que deseja acessar.
 * @returns {string|number|object|array|undefined} - O valor da variável de ambiente, convertido para o tipo apropriado,
 * ou undefined se a variável não estiver definida.
 */
function env(key) {
    const envValue = process.env[key];

    if (envValue === undefined) {
        return undefined; // Retorna undefined se a variável de ambiente não estiver definida
    }

    // Verifica se o valor é uma string representando um array
    if (envValue.startsWith('[') && envValue.endsWith(']')) {
        try {
            // Tenta analisar o valor como JSON
            return JSON.parse(envValue);
        } catch (error) {
            // Se houver um erro ao analisar como JSON, retorna a string original
            return envValue;
        }
    }

    // Verifica se o valor é uma string representando um objeto JSON
    if (envValue.startsWith('{') && envValue.endsWith('}')) {
        try {
            // Tenta analisar o valor como JSON
            return JSON.parse(envValue);
        } catch (error) {
            // Se houver um erro ao analisar como JSON, retorna a string original
            return envValue;
        }
    }

    // Verifica se o valor é um número
    if (!isNaN(envValue)) {
        return parseInt(envValue); // Converte para inteiro
    }

    return envValue; // Retorna como string se não for um array, objeto JSON ou número
}

/**
 * Salva um log em um arquivo ou no sistema de log do Unix, dependendo da configuração.
 * @param {string} message - A mensagem de log a ser salva.
 * @param {string} logChannel - O canal de log onde a mensagem deve ser registrada.
 */
function saveLog(message, logChannel = 'logs') {
    const logType = env('logs') || 'file'; // Verifica o tipo de log definido em process.env.logs

    const red = '\x1b[31m'; // Vermelho
    const green = '\x1b[32m'; // Verde
    const yellow = '\x1b[33m'; // Amarelo
    const reset = '\x1b[0m'; // Reset de cor

    if (logType === 'file') {
        const logsFolderPath = path.join(resolve_path('src'), 'logs');
        if (!fs.existsSync(logsFolderPath)) {
            fs.mkdirSync(logsFolderPath);
        }

        const logFilePath = path.join(logsFolderPath, `${logChannel}.log`); // Use o canal de log no nome do arquivo

        const maxSizeInBytes = 35 * 1024 * 1024; // 35 MB
        const stats = fs.statSync(logFilePath);

        if (stats.size >= maxSizeInBytes) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupLogFilePath = `${logFilePath}.${timestamp}`;

            fs.renameSync(logFilePath, backupLogFilePath);
            fs.writeFileSync(logFilePath, '');
        }

        const logMessage = `[${new Date().toISOString()}] - LOG: ${typeof message == 'string' ? message : JSON.stringify(message, null, 4)}\n`;

        fs.appendFile(logFilePath, logMessage, (err) => {
            if (err) {
                console.error('Erro ao salvar o log:', err);
            }
        });
    } else if (logType === 'unix') {
        if (logChannel === 'errors') {
            console.error(`${yellow}[${new Date().toISOString()}] - [${logChannel}] - ERROR: ${red}${typeof message == 'string' ? message : JSON.stringify(message, null, 4)}\n${reset}`);
        } else {
            console.log(`${green}[${new Date().toISOString()}] - [${logChannel}] - LOG: ${yellow}${typeof message == 'string' ? message : JSON.stringify(message, null, 4)}\n${reset}`);
        }
    } else {
        console.error('Tipo de log não suportado:', logType);
    }
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
        console.error('Erro ao ler o arquivo de traduções:', error);
    }

    let translation = translations[key] || key;

    // Substitui os placeholders na tradução, se houver substituições
    if (Object.keys(replacements).length > 0) {
        for (const placeholder in replacements) {
            const replacementValue = replacements[placeholder];
            const placeholderRegex = new RegExp(`:${placeholder}`, 'g');
            translation = translation.replace(placeholderRegex, replacementValue);
        }
    }

    return translation;
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
 * Finaliza um processo por PID ou uma lista de PIDs.
 * @param {number | Array<number>} pids - O PID ou uma lista de PIDs a serem encerrados.
 * @param {function} callback - Função de retorno de chamada a ser chamada após o encerramento do processo.
 */
function killProcess(pids, callback) {
    if (!Array.isArray(pids)) {
        pids = [pids]; // Se for um único PID, transforme em uma lista.
    }

    // Determina o comando a ser usado com base na plataforma.
    const platform = process.platform;
    let command, args;

    if (platform === 'win32') {
        command = 'taskkill';
        args = ['/F', '/T', '/PID']; // Força o encerramento e termina os subprocessos.
    } else if (platform === 'linux' || platform === 'darwin') {
        command = 'kill';
        args = ['-9']; // Sinal SIGKILL para forçar o encerramento.
    } else {
        throw new Error(`Plataforma não suportada: ${platform}`);
    }

    // Inicia o processo para cada PID.
    pids.forEach((pid) => {
        const process = spawn(command, [...args, pid.toString()]);

        process.on('close', (code) => {
            if (code === 0) {
                console.log(`Processo com PID ${pid} encerrado com sucesso.`);
                if (callback) {
                    callback(null, pid);
                }
            } else {
                console.error(`Erro ao encerrar o processo com PID ${pid}.`);
                if (callback) {
                    callback(new Error(`Erro ao encerrar o processo com PID ${pid}.`), pid);
                }
            }
        });
    });
}

module.exports = {
    resolve_path,
    env,
    saveLog,
    lang,
    usuario,
    banOrUnban,
    editOrSendMessage,
    sendPhotoOrMessage,
    sendAudioOrVideo,
    isUserInGroupOrChannel,
    updateTypeOrigin,
    isBanned,
    incDownload,
    saveAudioDb,
    sleep,
    killProcess
}
