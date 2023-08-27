const fs = require('fs');
const { usuario, lang, editOrSendMessage, saveAudioDb, incDownload, saveLog, sendPhotoOrMessage, isUserInGroupOrChannel, sleep, sendAudioOrVideo, resolve_path } = require('../../module/functions');
const SessionManager = require('../../module/sessionmanager');
const { Video } = require('../../module/ytdownloader');
const ffmpeg = require('../../module/ffmpeg');
const path = require('path');
const Database = require('better-sqlite3');
const cache = new SessionManager();
const db = new Database(resolve_path('database/bot.sqlite'));

/**
 * Obter as qualidades da media!
 * 
 * @param {import('telegraf').Context} ctx
 * @param {{
 *  video: import('../../module/ytdownloader').Video,
 *  videoID: string
 * }}
 * 
 * @returns {object}
 */
const getFormatosButtons = async (ctx, { video, videoID }) => {
    const chat_id = ctx.from.id;

    const user = usuario(ctx);
    const langCode = user.lang || '';

    let qualities;
    let informacoes = {};

    // Obtém a partir do cache!
    if (cache.existsKey(chat_id, `download_cache_${videoID}`)) {
        qualities = cache.get(chat_id, `download_cache_${videoID}`).qualidades;
        informacoes = cache.get(chat_id, `download_cache_${videoID}`).informacoes;
    } else {
        qualities = await video.getQualities();
        informacoes = await video.getInfo();
    }

    const { title, thumbnail, channel } = informacoes;

    const buttons = [];

    // Itera sobre os formatos disponíveis
    for (const format in qualities) {
        const formatOptions = qualities[format];

        if (formatOptions.total > 1) {
            // Cria um botão de separação com callback nulo
            buttons.push([{ text: `🔸 FORMATO: ${format}`, callback_data: 'download_format' }]);

            let qualy = []
            let count = 0;

            // Itera sobre as opções de qualidade do formato
            for (const opcao in formatOptions.qualidades) {
                const qualityInfo = formatOptions.qualidades[opcao];

                // Cria um botão para a qualidade com o callback /download (videoID) (format) (convert) (quality id)
                qualy.push({ text: `● ${qualityInfo.opcao}`, callback_data: `download ${videoID} ${format} ${qualityInfo.opcao} ${qualityInfo.id}` });

                // Verifica se já adicionou 4 botões e cria um novo grupo
                if (++count === 2) {
                    buttons.push(qualy);
                    qualy = []; // Limpa o array para o próximo grupo
                    count = 0; // Reseta o contador
                }
            }

            // Adicione qualquer botão restante
            if (qualy.length > 0) {
                buttons.push(qualy);
            }
        }
    }

    await ctx.deleteMessage(cache.get(chat_id, 'ultima_msg'));

    const text = `🔖 ${title}\n👤 ${channel}\n\n_${lang('select_quality', langCode)}_`;

    sendPhotoOrMessage(ctx, thumbnail, {
        caption: text.toString('utf-8'),
        reply_markup: {
            inline_keyboard: buttons
        },
        parse_mode: 'Markdown'
    })
        .then((id) => cache.update(chat_id, 'ultima_msg', id))
        .catch((error) => {
            saveLog(error, 'errors');
            ctx.reply(lang('error_get_qualities', langCode));
        });

    return qualities;
}

/**
 * Envia um áudio em cache ou executa um callback, se o áudio já estiver em cache.
 *
 * @param {Context} ctx O contexto da mensagem.
 * @param {string} id_video O ID do vídeo a ser verificado e encaminhado.
 * @param {Function} callback A função de callback a ser executada se o áudio não estiver em cache.
 */
const forwardCacheMusica = async (ctx, id_video, callback) => {
    const chat_id = ctx.from.id;
    const user = usuario(ctx);
    const langCode = user.hasOwnProperty('lang') ? user.lang : 'en';
    const bot_username = (await ctx.telegram.getMe()).username;

    // Verifica se o videoId já existe na tabela "musicas"
    const existingAudio = db.prepare('SELECT file_id, chat_id FROM musicas WHERE ytb_id = ?').get(id_video);

    // Cache Musica
    if (existingAudio) {
        const downloads = incDownload(existingAudio.file_id);

        // Cria as informações para a resposta
        const info = {
            chat_id,
            caption: `♻️ By Cache | 📥 ${downloads} Downloads\n\n**Made by ⚡️ @YoutubeMusicBetaBot**`,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: lang('share_this_bot', langCode), url: lang('share_link', langCode, { username: bot_username }) }]
                ]
            },
        };

        // Se houver metadados no arquivo de áudio, inclua-os na resposta
        if (existingAudio.metadata) {
            Object.assign(info, JSON.parse(existingAudio.metadata), { thumbnail: existingAudio.thumbnail });
        }

        // Responde com o áudio do cache
        ctx.persistentChatAction("upload_voice", () => ctx.replyWithAudio(existingAudio.file_id, info));
    } else if (callback) {
        // Executa o callback se fornecido e o áudio não estiver em cache
        callback(ctx);
    }
}

/**
 * Verifica se o limite de processos foi atingido e executa um callback, se necessário.
 *
 * @param {Context} ctx O contexto da mensagem.
 * @param {string} id_video O ID do vídeo a ser verificado.
 * @param {Function} callback A função de callback a ser executada se o limite de processos for atingido.
 */
const limiteProcessos = async (ctx, id_video, callback) => {
    const chat_id = ctx.from.id;
    const user = usuario(ctx);
    const langCode = user.hasOwnProperty('lang') ? user.lang : 'en';

    // Limita processos!
    if (cache.existsKey(chat_id, 'queue')) {
        const queueLength = Object.keys(cache.get(chat_id, 'queue')).length;

        if (queueLength >= 1) {
            ctx.reply(lang('process_exceeded', langCode, { count: queueLength }));
            return;
        }

        for (const item of Object.values(cache.get(chat_id, 'queue'))) {
            if (item.video == id_video) {
                ctx.reply(lang('in_process', langCode));
                return;
            }
        }
    }

    if (callback) {
        callback(ctx);
    }
}

/**
 * Baixar uma musica
 * 
 * @param {import('telegraf').Context} ctx
 * @param {import('../../module/ytdownloader').Audio} music 
 * @param {string} id_video 
 */
const baixarMusica = async (ctx, music, id_video) => {
    const chat_id = ctx.from.id;
    const user = usuario(ctx);
    const langCode = user.lang || '';
    let processo_id;

    music.setUrl(`https://music.youtube.com/watch?v=${id_video}`);

    try {
        await editOrSendMessage(ctx, cache.get(chat_id, 'ultima_msg'), lang('downloading', langCode))
            .then((id) => cache.update(chat_id, 'ultima_msg', id));

        const isVip = await isUserInGroupOrChannel(ctx);
        const IsDownloadVip = isVip ? 'downloading_progress_vip' : 'downloading_progress';

        // Obtenha o processo_id do downloadMusic
        const downloadProcess = music.downloadMusic(id_video, isVip);
        processo_id = downloadProcess.processo_id;

        downloadProcess.progress(async (progress) => {
            const text = lang(IsDownloadVip, langCode, {
                progress: progress.porcentagem,
                megabytes: progress.baixado
            });

            const msgId = cache.get(chat_id, 'ultima_msg');

            const updateQueue = (id) => {
                cache.update(chat_id, 'queue', {
                    ...cache.get(chat_id, 'queue'),
                    [processo_id]: {
                        video: id_video,
                        ultima_msg: id
                    }
                });
            };

            if (msgId) {
                await editOrSendMessage(ctx, msgId, text)
                    .then(updateQueue);
            } else {
                const msgIdFromQueue = cache.get(chat_id, 'queue')[processo_id].ultima_msg;

                await editOrSendMessage(ctx, msgIdFromQueue, text)
                    .then(updateQueue);
            }
        }).onComplete(async (result) => {
            const cache_queue = cache.get(chat_id, 'queue');
            const msgIdFromQueue = cache_queue[processo_id].ultima_msg;
            await ctx.deleteMessage(msgIdFromQueue);

            delete cache_queue[processo_id]; // Apaga o processo da lista

            // Atualiza os processos da lista cache
            cache.update(chat_id, 'queue', cache_queue);

            const { title, artist, duration, capa, song_path } = result;
            const backup_chat = process.env.backup_channel_id;

            // Enviar para o canal de backup
            ctx.replyWithAudio({ source: song_path }, {
                chat_id: backup_chat,
                performer: artist,
                title: title,
                duration: duration,
                thumbnail: capa,
                caption: `Request by ${ctx.from.first_name}\n\n**Made by ⚡️ @YoutubeMusicBetaBot**`,
                parse_mode: 'Markdown'
            }).then(resp => {
                // Registra o áudio na tabela "musicas"
                saveAudioDb(backup_chat, chat_id, resp.audio.file_id, id_video, {
                    title,
                    performer: artist,
                    duration
                }, capa);

                ctx.sendChatAction("upload_voice");

                ctx.persistentChatAction("upload_voice", () => {
                    ctx.replyWithAudio(resp.audio.file_id, {
                        chat_id,
                        performer: artist,
                        title: title,
                        duration: duration,
                        thumbnail: capa,
                        caption: `**Made by ⚡️ @YoutubeMusicBetaBot**`,
                        parse_mode: 'Markdown'
                    })
                        .finally(incDownload(resp.audio.file_id));
                });
            }).catch(async () => {
                let cache_queue = cache.get(chat_id, 'queue');
                await ctx.deleteMessage(cache_queue[processo_id].ultima_msg);

                delete cache_queue[processo_id];

                // Deleta o processo da lista cache
                cache.update(chat_id, 'queue', cache_queue)

                // Exclui a pasta após o envio para o Telegram
                fs.rm(result.path, { recursive: true }, (err) => {
                    if (err) {
                        console.error(err.message);
                        return;
                    }
                });
            }).finally(async () => {
                cache.delete(chat_id, `download_cache_${id_video}`); // Deleta as informações de midia do cache

                let cache_queue = cache.get(chat_id, 'queue');

                delete cache_queue[processo_id];

                // Deleta o processo da lista cache
                cache.update(chat_id, 'queue', cache_queue)

                // Exclui a pasta após o envio para o Telegram
                fs.rm(result.path, { recursive: true }, (err) => {
                    if (err) {
                        console.error(err.message);
                        return;
                    }
                });
            });
        });

        cache.update(chat_id, 'queue', {
            [processo_id]: {
                video: id_video,
                ultima_msg: cache.get(chat_id, 'ultima_msg')
            }
        });
    } catch (error) {
        // Trate o erro aqui, se necessário
        console.error(error);

        // Se ocorrer um erro, limpe a fila
        const cache_queue = cache.get(chat_id, 'queue');
        if (processo_id && cache_queue[processo_id]) {
            delete cache_queue[processo_id];
            cache.update(chat_id, 'queue', cache_queue);
        }

        cache.delete(chat_id, `download_cache_${id_video}`);

        // Responda ao usuário com uma mensagem de erro
        await editOrSendMessage(ctx, lang('error_occurred', langCode), null);
    }
}

const limparFila = (chat_id, id, video_id) => {
    let cache_queue = cache.get(chat_id, 'queue');

    delete cache_queue[id];

    cache.update(chat_id, 'queue', cache_queue);

    cache.delete(chat_id, `download_cache_${video_id}`);
    cache.delete(chat_id, 'update_progress');
}

/**
 * Baixar uma midia Video/Audio
 * 
 * @param {import('telegraf').Context} ctx 
 * @param {object} params 
 * @returns 
 */
const baixarMidia = async (ctx, params) => {
    const chat_id = ctx.from.id;
    const user = usuario(ctx);
    const langCode = user.hasOwnProperty('lang') ? user.lang : 'en';
    const bot_username = (await ctx.telegram.getMe()).username;

    let processo_id;

    const [cmd, video_id, formato, qualidade] = params;
    const video = new Video();

    if (!cache.existsKey(chat_id, `download_cache_${video_id}`)) {
        ctx.answerCbQuery(lang('expire_link_cache', langCode), {
            callback_query_id: ctx.callbackQuery.id,
            show_alert: true
        });

        return;
    }

    const { id, formato_original, recode } = cache.get(chat_id, `download_cache_${video_id}`).qualidades[formato].qualidades[qualidade];
    await ctx.deleteMessage(cache.get(chat_id, 'ultima_msg'));

    video.setUrl(`https://www.youtube.com/watch?v=${video_id}`);

    try {
        await editOrSendMessage(ctx, cache.get(chat_id, 'ultima_msg'), lang('downloading', langCode))
            .then((id) => cache.update(chat_id, 'ultima_msg', id));

        const isVip = await isUserInGroupOrChannel(ctx);
        const IsDownloadVip = isVip ? 'downloading_progress_vip' : 'downloading_progress';

        // Obtenha o processo_id 
        const downloadProcess = video.download_convert(video_id, formato_original, formato, qualidade, id, recode, isVip)
        processo_id = downloadProcess.processo_id;

        if (!processo_id) throw new Error('Erro ao obter o processo_id');

        // Adicione o processo à fila
        cache.update(chat_id, 'queue', {
            ...cache.get(chat_id, 'queue'),
            [processo_id]: {
                video: video_id,
                ultima_msg: cache.get(chat_id, 'ultima_msg')
            }
        });

        downloadProcess.progress(async (progress) => {
            const text = lang(IsDownloadVip, langCode, {
                progress: progress.porcentagem,
                megabytes: progress.baixado,
            });

            const msgIdFromQueue = cache.get(chat_id, 'queue')[processo_id]?.ultima_msg;

            const updateQueue = (id) => {
                cache.update(chat_id, 'queue', {
                    ...cache.get(chat_id, 'queue'),
                    [processo_id]: {
                        ...cache.get(chat_id, 'queue')[processo_id],
                        ultima_msg: id,
                    },
                });
            };

            // Verifica o cache para controlar o número de mensagens enviadas
            const updateProgressCache = cache.get(chat_id, 'update_progress') || { time: Date.now(), count: 0 };

            // Define um limite para o número de mensagens em um intervalo de tempo
            const limiteMensagens = 7; // Ajuste conforme necessário
            const limiteTempo = 1000; // 1500ms = 1,5 segundos, ajuste conforme necessário

            if (updateProgressCache.count >= limiteMensagens && (Date.now() - updateProgressCache.time) < limiteTempo) {
                // Se estiver entrando em spam, não envie mensagens até que o progresso seja próximo de 100%
                if (progress.porcentagem >= 98) {
                    await editOrSendMessage(ctx, msgIdFromQueue, text)
                        .then(updateQueue);
                }

                return;
            } else {
                // Atualize o cache com o número de mensagens enviadas
                cache.update(chat_id, 'update_progress', { time: Date.now(), count: updateProgressCache.count + 1 });

                await sleep(1000);

                await editOrSendMessage(ctx, msgIdFromQueue, text).then(updateQueue);
            }
        });

        downloadProcess.onComplete(async (data) => {
            const informacoes = cache.get(chat_id, `download_cache_${video_id}`).informacoes;

            let { pasta, arquivo, nome, recode } = data;
            const nomeArquivo = video.fileNameReplace(informacoes.title);

            if (recode) {
                const ffmpegConverter = ffmpeg(arquivo, `${pasta}/${nomeArquivo}_${qualidade}.${formato}`, qualidade);

                ffmpegConverter.start()
                    .progress(async (progress) => {
                        const msgIdFromQueue = cache.get(chat_id, 'queue')[processo_id]?.ultima_msg;

                        const updateQueue = (id) => cache.update(chat_id, 'queue', {
                            ...cache.get(chat_id, 'queue'),
                            [processo_id]: {
                                ...cache.get(chat_id, 'queue')[processo_id],
                                ultima_msg: id
                            }
                        });

                        await sleep(1000);

                        await editOrSendMessage(ctx, msgIdFromQueue, lang('converting', langCode, { progress: progress.porcentagem }))
                            .then(updateQueue);
                    })
                    .onComplete(async (result) => {
                        await ctx.deleteMessage(cache.get(chat_id, 'ultima_msg'));

                        let { arquivo } = result;

                        let text = lang('share_this_bot', langCode), url = lang('share_link', langCode, { username: bot_username });

                        try {
                            await sendAudioOrVideo(ctx, arquivo, {
                                caption: `${informacoes.title}\n\n**Made by ⚡️ @YoutubeMusicBetaBot**`,
                                parse_mode: 'Markdown',
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text, url }]
                                    ]
                                }
                            }).catch(() => {
                                fs.rm(pasta, { recursive: true }, (err) => err && console.error(err.message));
                                limparFila(chat_id, processo_id, video_id)
                            }).finally(async () => {
                                fs.rm(pasta, { recursive: true }, (err) => err && console.error(err.message));
                                limparFila(chat_id, processo_id, video_id);
                            })
                        } catch (error) {
                            console.error(error)
                            fs.rm(pasta, { recursive: true }, (err) => err && console.error(err.message));
                            limparFila(chat_id, processo_id, video_id)
                        }
                    });
            } else {
                let text = lang('share_this_bot', langCode), url = lang('share_link', langCode, { username: bot_username });

                try {
                    await sendAudioOrVideo(ctx, arquivo, {
                        caption: `${informacoes.title}\n\n**Made by ⚡️ @YoutubeMusicBetaBot**`,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text, url }]
                            ]
                        }
                    }).catch(() => {
                        fs.rm(pasta, { recursive: true }, (err) => err && console.error(err.message));
                        limparFila(chat_id, processo_id, video_id)
                    }).finally(async () => {
                        fs.rm(pasta, { recursive: true }, (err) => err && console.error(err.message));
                        limparFila(chat_id, processo_id, video_id)
                    })
                } catch (error) {
                    console.error(error)
                    fs.rm(pasta, { recursive: true }, (err) => err && console.error(err.message));
                    limparFila(chat_id, processo_id, video_id)
                }
            }
        });
    } catch (error) {
        // Trate o erro aqui, se necessário
        console.error(error);

        limparFila(chat_id, processo_id, video_id)

        // Responda ao usuário com uma mensagem de erro
        await editOrSendMessage(ctx, lang('error_occurred', langCode), null);
    }
}

module.exports = {
    getFormatosButtons,
    baixarMusica,
    baixarMidia,
    forwardCacheMusica,
    limiteProcessos
}