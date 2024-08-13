const fs = require('fs');
const path = require('path');

const { lang, redisRecovery, shortNumerals, friendlyDate, shortText, editOrSendMessage, redisProcesses, redisRemember, sendAudioOrVideo, curlRequest, formatFilename, Logger, sleep, isUserInGroupOrChannel, env, getInviteLinks } = require("../../module/functions");
const { YoutubeVideo, YoutubeAudio } = require("../../module/ytdownloader");
const redisClient = require("../../module/redisClient");

const { User, MidiaCache } = require("../../../models");
const { searchMusics } = require('../../module/ytmusicsearch');
const YT5s = require('../../module/yt5s');

const specialRegex = {
    //youtube: /(?:https?:\/\/)?(?:www\.)?youtu(?:\.be\/|be.com\/\S*(?:|v|watch|e|embed|shorts)(?:(?:(?=\/[-a-zA-Z0-9_]{11,}(?!\S))\/)|(?:\S*v=|v\/)))(?<video_id>[-a-zA-Z0-9_]{11,})/,
    youtube: /^((?:https?:)?\/\/)?((?:www|m|music)\.)?((?:youtube\.com|youtu\.be))(\/(?:[\w\-]+\?v=|\w+\/|v\/)?)(?<video_id>[\w\-]+)(\S+)?$/,
    callback_download: /\s(?<video_id>[^\s]+)\s(?<format_id>[^\s]+)\s?(?<audio_id>[^\s]+)?\s?(?<vipmode>[^\s]+)?/,
    summarize: /\s(?<video_id>[^\s]+)/
}

const vip_qualities = ['2160p', '1440p', '1080p', '1920p', '320k'];

/**
 * Obtém os dados do vídeo do YouTube.
 * 
 * @param {import('telegraf').Context} ctx - Contexto do Telegraf com informações da query inline e do usuário.
 * @param {string} video_id
 */
async function fetchVideoOptions(ctx, video_id) {
    const chat_id = ctx.from.id;
    const langCode = await User.getLang(chat_id);

    const downloadingKey = `DOWNLOADING_LAST_MSG:${chat_id}:${video_id}`;
    const videoData = await redisRecovery(`VIDEO_DATA:${video_id}`);

    // Link expirado
    if (!videoData) {
        await editOrSendMessage(ctx, null, lang('expire_link_cache', langCode), {}, true, downloadingKey);
        return;
    }

    // Excede o maximo 15 minutos
    if (videoData.data.duration > 900) {
        await editOrSendMessage(ctx, null, lang('time_exceeded', langCode, { minute: 15 }), {}, true, downloadingKey);
        return;
    }

    // E uma live
    if (videoData.data.live) {
        await editOrSendMessage(ctx, null, lang('time_exceeded', langCode, { minute: `15m (VIDEO LIVE)` }), {}, true, downloadingKey);
        return;
    }

    // Cria separador para as qualidades de vídeo e gera os botões em pares para duas colunas
    const videoButtons = videoData.qualities.videoFormats.length ?
        videoData.qualities.videoFormats.reduce((acc, format, index, array) => {
            if (index % 2 === 0) {
                const nextFormat = array[index + 1];
                const buttonPair = [{
                    text: `${vip_qualities.includes(format.quality) ? '⭐️' : ''} ${format.quality} · ${format.fileSize}`,
                    callback_data: `download ${video_id} ${format.formatId} ${videoData.qualities.audioFormat.formatId} ${vip_qualities.includes(format.quality) ? 'vip' : ''}`
                }];
                if (nextFormat) {
                    buttonPair.push({
                        text: `${vip_qualities.includes(nextFormat.quality) ? '⭐️' : ''} ${nextFormat.quality} · ${nextFormat.fileSize}`,
                        callback_data: `download ${video_id} ${nextFormat.formatId} ${videoData.qualities.audioFormat.formatId} ${vip_qualities.includes(nextFormat.quality) ? 'vip' : ''}`
                    });
                }
                acc.push(buttonPair);
            }
            return acc;
        }, [[{ text: `👇 Qualities in "Video" 👇`, callback_data: 'download_format' }]]) : [];

    // Cria separador e botão para a qualidade de áudio
    const audioButton = videoData.qualities.audioFormat ? [
        [{ text: `👇 Qualities in "Audio" 👇`, callback_data: 'download_format' }],
        [{
            text: `🎵 Audio Only · ${videoData.qualities.audioFormat.fileSize}`,
            callback_data: `download ${video_id} ${videoData.qualities.audioFormat.formatId}`
        }]
    ] : [];

    // Combina botões de vídeo e áudio
    let buttons = [...videoButtons, ...audioButton];

    //fs.writeFileSync('test2.json', JSON.stringify(buttons, null, 2));

    if (!buttons.length) {
        await editOrSendMessage(ctx, null, lang('error_get_qualities', langCode), {}, true, downloadingKey);
        return;
    }

    buttons = [...buttons, [{
        text: `✨ Summarize Video`,
        callback_data: `summarize ${video_id}`
    }]];

    await editOrSendMessage(ctx, null, `*${videoData.data.title}*\n`
        + `\n• 📺 [${videoData.data.channel}](${videoData.data.channel_url}) ${videoData.data.channel_is_verified ? '⭐' : ''} _(${shortNumerals(videoData.data.channel_follower_count)} subs)_`
        + `\n• 🗓 ${friendlyDate(videoData.data.upload_date, langCode)}`
        + `\n• ⏰ ${videoData.data.duration < 60 ? '0:' + videoData.data.duration : videoData.data.duration_string} | `
        + `👁 ${shortNumerals(videoData.data.view_count)} views`
        + `\n• 📜 _${shortText(videoData.data.description.replace(/\r?\n|\r/g, " ") || 'No description...', 60)}_`
        + `${videoData.data.tags.length ? '\n• 🔖 `' + shortText(videoData.data.tags.map(tag => `#${tag}`).join(', '), 60) + '`' : ''}`
        + `[ㅤ](${videoData.data.thumbnail})\n`
        + `\n_${lang('select_quality', langCode)}_`, {
        reply_markup: { inline_keyboard: buttons },
    }, true, downloadingKey);
}

/**
 * Baixa ou video, converte para MP4/MP3
 * 
 * @param {import('telegraf').Context} ctx - Contexto do Telegraf com informações da query inline e do usuário.
 */
async function mediaDownload(ctx, { video_id, format_id, audio_id = undefined }) {
    const chat_id = ctx.from.id;
    const langCode = await User.getLang(chat_id);
    const vip = await isUserInGroupOrChannel(ctx);

    const progresskey = `PROGRESS_LAST_MSG:${chat_id}:${video_id}`;
    const queueKey = `DOWNLOADS:${chat_id}`;
    const downloadingKey = `DOWNLOADING_LAST_MSG:${chat_id}:${video_id}`;

    const videoData = await redisRecovery(`VIDEO_DATA:${video_id}`);
    let lastProgress = await redisRecovery(progresskey);

    if (!videoData) {
        await editOrSendMessage(ctx, null, lang('expire_link_cache', langCode), {}, true, downloadingKey);
        return;
    }

    // Traz do cache
    const midia = await MidiaCache.getMidia(video_id);
    if (midia?.file_id && !audio_id) {
        const username = ctx.botInfo.username;
        const text = lang('share_this_bot', langCode), url = lang('share_link', langCode, { username });
        try { await ctx.deleteMessage(await redisRecovery(downloadingKey)); } catch (error) { Logger.error(error); }
        await ctx.sendChatAction('upload_voice');
        const downloads = shortNumerals(await MidiaCache.countDownloads(video_id));
        const copyMsg = await ctx.telegram.copyMessage(ctx.from.id, midia.repo_id, midia.message_id, {
            parse_mode: 'Markdown',
            caption: `📥 ${downloads} Download(s)\n\n*Made by ⚡️ @${ctx.botInfo.username}*`,
            reply_markup: { inline_keyboard: [[{ text, url }]] }
        });
        await ctx.setMessageReaction(ctx.from.id, copyMsg.message_id, "⚡");
        await MidiaCache.addDownload(video_id);
        return;
    }

    // Excede o maximo 15 minutos
    if (videoData.data.duration > 900) {
        await editOrSendMessage(ctx, null, lang('time_exceeded', langCode, { minute: 15 }), {}, true, downloadingKey);
        return;
    }

    if (await redisProcesses(queueKey).count() >= 1) {
        let countProcess = await redisProcesses(queueKey).count();

        await editOrSendMessage(ctx, null, lang('process_exceeded', langCode, {
            count: countProcess
        }), {}, true, downloadingKey);
        return;
    }

    await editOrSendMessage(ctx, null, lang('downloading', langCode), {}, true, downloadingKey);
    const join_link = await getInviteLinks(ctx);

    // alternative download
    if (format_id.includes('@')) {
        const format = format_id.split('@')[0];
        const quality = format_id.split('@')[1];
        const yt5Class = new YT5s(`https://www.youtube.com/watch?v=${video_id}`);

        await redisProcesses(queueKey).add(video_id); // Add +1 processo para o usuario.

        await yt5Class.onProgress(async (progress) => {
            try {
                const lastProgress = await redisRecovery(progresskey);
                const now = Date.now();

                // Verifica se a última atualização foi há mais de 2 segundos
                if (!lastProgress || (now - parseInt(lastProgress.time)) >= 2000) {
                    const text = lang('converting', langCode, { progress, speed: 0, join_link });
                    await editOrSendMessage(ctx, null, text, { disable_web_page_preview: true }, true, downloadingKey)
                        .then(async ({ message_id }) => {
                            await redisClient.set(progresskey, JSON.stringify({ message_id, time: Date.now() }));
                        });
                }
            } catch (error) {
                console.error('Erro ao atualizar progresso:', error);
            }
        }).onComplete(async ({ file, size }) => {
            console.log('DATA:', file, size);
            const path_parts = file.split('/');
            const bin_name = path_parts[path_parts.length - 2] || 'download';
            const file_name = path_parts[path_parts.length - 1] || 'download';
            const api_url = 'https://filebin.net';
            const text = lang('converting', langCode, { progress: 100, speed: 0, join_link });
            const shareText = lang('share_this_bot', langCode), shareUrl = lang('share_link', langCode, { username: ctx.botInfo.username });
            await editOrSendMessage(ctx, null, text, { disable_web_page_preview: true }, true, downloadingKey)
                .then(async ({ message_id }) => await redisClient.set(progresskey, JSON.stringify({ message_id, time: Date.now() })));
            try {
                // Tamanho maior que 50mb
                if (size >= 52428800) {
                    await editOrSendMessage(ctx, null, lang('big_file', langCode), {}, true, downloadingKey);

                    try {
                        const { httpCode, headers, body } = await curlRequest(`${api_url}/${bin_name}/${formatFilename(file_name)}`, 'POST', { input_file: file }, {
                            'accept': 'application/json',
                            'cid': '@YoutubeMusicBetaBot',
                            'Content-Type': 'application/octet-stream'
                        });

                        if (httpCode === 201) {
                            const description = lang('link_file_download', langCode)
                                + `\n\n• 📄 \`${body.file.filename}\` (${body.file.bytes_readable})`
                                + `\n• 🔗 [Download Link](${api_url}/${bin_name})`
                                + `\n• ⏳ _${body.bin.expired_at_relative}_`;

                            await editOrSendMessage(ctx, null, description, {
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: shareText, url: shareUrl }],
                                        [{ text: 'Download Link', url: `${api_url}/${bin_name}` }]
                                    ]
                                }
                            }, true, downloadingKey).then(async ({ message_id }) => await ctx.setMessageReaction(ctx.from.id, message_id, "😁"));

                            redisClient.del(progresskey); // Remove o cache de controle progresso.
                            redisClient.del(`VIDEO_DATA:${video_id}`)
                        }
                    } catch (error) {
                        Logger.error(error);

                        ctx.chat.id = ctx.from.id;
                        await editOrSendMessage(ctx, null, lang('error_upload', langCode), {}, true, downloadingKey);
                    }
                } else {
                    try { await ctx.deleteMessage(await redisRecovery(downloadingKey)); } catch (error) { Logger.error(error) }
                    try {
                        const ext = file.slice(-4).toLowerCase();
                        const chatAction = ['.mp3', '.m4a', '.wav'].includes(ext) ? 'upload_voice' : ['.mp4', '.mkv'].includes(ext) ? 'upload_video' : '';

                        if (chatAction === 'upload_voice') {
                            ctx.chat.id = env('CACHE_CHANNEL');
                        }

                        // Preparar os parâmetros comuns para sendAudioOrVideo
                        const commonParams = {
                            caption: chatAction === 'upload_voice' ? `Enviado por *${ctx.chat.first_name} ${ctx.chat?.last_name || ''}*` : `*Made by ⚡️ @${ctx.botInfo.username}*`,
                            duration: videoData.data.duration,
                            performer: videoData.data.channel,
                            title: videoData.data.title,
                            thumbnail: { url: `https://i.ytimg.com/vi/${video_id}/default.jpg` },
                            parse_mode: 'Markdown',
                            type: chatAction === 'upload_video' ? 'video' : 'audio'
                        };

                        // Adicionar reply_markup apenas se não for 'upload_voice'
                        if (chatAction !== 'upload_voice') {
                            commonParams.reply_markup = { inline_keyboard: [[{ text: shareText, url: shareUrl }]] };
                        }

                        // Se for audio manda para canal de cache! Se não envia sem fazer cache.
                        await sendAudioOrVideo(ctx, file, commonParams)
                            .then(async ({ message_id, audio }) => {
                                // Copia do canal de cache, Envia para usuario
                                if (chatAction === 'upload_voice') {
                                    try {
                                        await MidiaCache.createMidia({
                                            file_id: audio.file_id,
                                            id_telegram: ctx.from.id,
                                            repo_id: env('CACHE_CHANNEL'),
                                            message_id: message_id,
                                            youtube_id: video_id
                                        })

                                        await MidiaCache.addDownload(video_id);
                                    } catch (error) {
                                        Logger.error(error);
                                    }

                                    await ctx.sendChatAction(chatAction);

                                    // Copia do canal de cache, Envia para usuario
                                    const copyMsg = await ctx.telegram.copyMessage(ctx.from.id, env('CACHE_CHANNEL'), message_id, {
                                        parse_mode: 'Markdown',
                                        caption: `*Made by ⚡️ @${ctx.botInfo.username}*`,
                                        reply_markup: {
                                            inline_keyboard: [[{ text: shareText, url: shareUrl }]]
                                        }
                                    });

                                    await ctx.setMessageReaction(ctx.from.id, copyMsg.message_id, "😁");
                                } else {
                                    await ctx.setMessageReaction(ctx.from.id, message_id, "😁")
                                }
                            });

                        redisClient.del(progresskey); // Remove o cache de controle progresso.
                        redisClient.del(`VIDEO_DATA:${video_id}`)
                    } catch (error) {
                        console.error(error)

                        ctx.chat.id = ctx.from.id;
                        await editOrSendMessage(ctx, null, lang('error_upload', langCode), {}, true, downloadingKey);
                    }
                }
            } catch (error) {
                console.error('Erro ao verificar o tamanho do arquivo:', error);
            }
            await redisProcesses(queueKey).rem(video_id); // Remove -1 processo para o usuario.
        }).onError(async (message, error) => {
            ctx.chat.id = ctx.from.id;
            await editOrSendMessage(ctx, null, lang('error_upload', langCode), {}, true, downloadingKey);
        }).download(format, quality, `yt5s.io-${videoData.data.title}`)
    } else { // yt-dlp download
        const fetchVideo = new YoutubeVideo(video_id);

        fetchVideo.downloadVideo(video_id, format_id, audio_id, vip)
            .then(async (processQueue) => {
                await redisProcesses(queueKey).add(processQueue.processId); // Add +1 processo para o usuario.

                redisRemember(progresskey, async () => ({ message_id: await redisRecovery(downloadingKey), time: Date.now() }));

                processQueue.progress(async ({ porcentagem, baixado, velocidade, converting }) => {
                    lastProgress = await redisRecovery(progresskey), now = Date.now();

                    if (!lastProgress || (now - lastProgress.time) >= 2500) {
                        const statusLang = (converting == true) ? 'converting' : (vip ? 'downloading_progress_vip' : 'downloading_progress');
                        const text = lang(statusLang, langCode, { progress: porcentagem, speed: velocidade, join_link });

                        await editOrSendMessage(ctx, null, text, { disable_web_page_preview: true }, true, downloadingKey)
                            .then(async ({ message_id }) => await redisClient.set(progresskey, JSON.stringify({ message_id, time: now })));
                    }
                }).onComplete(async ({ file_name, source, folder_download, size, createdAt, width, height }) => {
                    const text = lang('share_this_bot', langCode), url = lang('share_link', langCode, { username: ctx.botInfo.username });
                    const api_url = 'https://filebin.net', bin_name = folder_download?.split('/').pop() || 'download';

                    // Tamanho maior que 50mb
                    if (size >= 52428800) {
                        await editOrSendMessage(ctx, null, lang('big_file', langCode), {}, true, downloadingKey);

                        try {
                            const { httpCode, headers, body } = await curlRequest(`${api_url}/${bin_name}/${formatFilename(file_name)}`, 'POST', { input_file: source }, {
                                'accept': 'application/json',
                                'cid': '@YoutubeMusicBetaBot',
                                'Content-Type': 'application/octet-stream'
                            });

                            if (httpCode === 201) {
                                const description = lang('link_file_download', langCode)
                                    + `\n\n• 📄 \`${body.file.filename}\` (${body.file.bytes_readable})`
                                    + `\n• 🔗 [Download Link](${api_url}/${bin_name})`
                                    + `\n• ⏳ _${body.bin.expired_at_relative}_`;

                                await editOrSendMessage(ctx, null, description, {
                                    reply_markup: {
                                        inline_keyboard: [
                                            [{ text, url }],
                                            [{ text: 'Download Link', url: `${api_url}/${bin_name}` }]
                                        ]
                                    }
                                }, true, downloadingKey)
                                    .then(async ({ message_id }) => await ctx.setMessageReaction(ctx.from.id, message_id, "😁"));
                            }
                        } catch (error) {
                            Logger.error(error);

                            ctx.chat.id = ctx.from.id;
                            await editOrSendMessage(ctx, null, lang('error_upload', langCode), {}, true, downloadingKey);
                        }
                    } else {
                        try { await ctx.deleteMessage(await redisRecovery(downloadingKey)); } catch (error) { Logger.error(error) }

                        try {
                            const ext = file_name.slice(-4).toLowerCase();
                            const chatAction = ['.mp3', '.m4a', '.wav'].includes(ext) ? 'upload_voice' : ['.mp4', '.mkv'].includes(ext) ? 'upload_video' : '';

                            if (chatAction === 'upload_voice') {
                                ctx.chat.id = env('CACHE_CHANNEL');
                            }

                            // Preparar os parâmetros comuns para sendAudioOrVideo
                            const commonParams = {
                                caption: chatAction === 'upload_voice' ? `Enviado por *${ctx.chat.first_name} ${ctx.chat?.last_name || ''}*` : `*Made by ⚡️ @${ctx.botInfo.username}*`,
                                duration: videoData.data.duration,
                                performer: videoData.data.channel,
                                title: videoData.data.title,
                                thumbnail: { url: `https://i.ytimg.com/vi/${video_id}/default.jpg` },
                                parse_mode: 'Markdown',
                                width,
                                height
                            };

                            // Adicionar reply_markup apenas se não for 'upload_voice'
                            if (chatAction !== 'upload_voice') {
                                commonParams.reply_markup = { inline_keyboard: [[{ text, url }]] };
                            }

                            // Se for audio manda para canal de cache! Se não envia sem fazer cache.
                            await sendAudioOrVideo(ctx, source, commonParams)
                                .then(async ({ message_id, audio }) => {
                                    // Copia do canal de cache, Envia para usuario
                                    if (chatAction === 'upload_voice') {
                                        try {
                                            await MidiaCache.createMidia({
                                                file_id: audio.file_id,
                                                id_telegram: ctx.from.id,
                                                repo_id: env('CACHE_CHANNEL'),
                                                message_id: message_id,
                                                youtube_id: video_id
                                            })

                                            await MidiaCache.addDownload(video_id);
                                        } catch (error) {
                                            Logger.error(error);
                                        }

                                        await ctx.sendChatAction(chatAction);

                                        // Copia do canal de cache, Envia para usuario
                                        const copyMsg = await ctx.telegram.copyMessage(ctx.from.id, env('CACHE_CHANNEL'), message_id, {
                                            parse_mode: 'Markdown',
                                            caption: `*Made by ⚡️ @${ctx.botInfo.username}*`,
                                            reply_markup: {
                                                inline_keyboard: [[{ text, url }]]
                                            }
                                        });

                                        await ctx.setMessageReaction(ctx.from.id, copyMsg.message_id, "😁");
                                    } else {
                                        await ctx.setMessageReaction(ctx.from.id, message_id, "😁")
                                    }
                                });
                        } catch (error) {
                            Logger.error(error);

                            ctx.chat.id = ctx.from.id;
                            await editOrSendMessage(ctx, null, lang('error_upload', langCode), {}, true, downloadingKey);
                        }
                    }

                    // try {
                    //     folder_download && fs.rm(folder_download, { recursive: true }, (err) => err && console.error(err.message));
                    // } catch (error) { }

                    await redisProcesses(queueKey).rem(processQueue.processId); // Remove -1 processo para o usuario.
                    redisClient.del(progresskey); // Remove o cache de controle progresso.
                    redisClient.del(`VIDEO_DATA:${video_id}`)
                }).onError(async (error) => {
                    Logger.error(error);
                    await editOrSendMessage(ctx, null, lang('error_upload', langCode), {}, true, downloadingKey);
                    await redisProcesses(queueKey).rem(processQueue.processId); // Remove -1 processo para o usuario.
                    redisClient.del(progresskey); // Remove o cache de controle progresso.
                });
            });
    }
}

/**
 * Baixa musicas do Youtube Music.
 * 
 * @param {import('telegraf').Context} ctx - Contexto do Telegraf com informações da query inline e do usuário.
 * @param {string} video_id 
 */
async function musicDownload(ctx, video_id) {
    const chat_id = ctx.from.id;
    const langCode = await User.getLang(chat_id);
    const vip = await isUserInGroupOrChannel(ctx);

    const progresskey = `PROGRESS_LAST_MSG:${chat_id}:${video_id}`;
    const queueKey = `DOWNLOADS:${chat_id}`;
    const downloadingKey = `DOWNLOADING_LAST_MSG:${chat_id}:${video_id}`;

    const videoData = await redisRecovery(`VIDEO_DATA:${video_id}`);
    let lastProgress = await redisRecovery(progresskey);

    // Link expirado
    if (!videoData) {
        await editOrSendMessage(ctx, null, lang('expire_link_cache', langCode), {}, true, downloadingKey);
        return;
    }

    // Excede o maximo 15 minutos
    if (videoData.data.duration > 900) {
        await editOrSendMessage(ctx, null, lang('time_exceeded', langCode, { minute: 15 }), {}, true, downloadingKey);
        return;
    }

    // E uma live
    if (videoData.data.live) {
        await editOrSendMessage(ctx, null, lang('time_exceeded', langCode, { minute: `15m (VIDEO LIVE)` }), {}, true, downloadingKey);
        return;
    }

    const midia = await MidiaCache.getMidia(video_id);
    if (midia?.file_id) {
        const username = ctx.botInfo.username;
        const text = lang('share_this_bot', langCode), url = lang('share_link', langCode, { username });
        try { await ctx.deleteMessage(await redisRecovery(downloadingKey)); } catch (error) { Logger.error(error); }
        await ctx.sendChatAction('upload_voice');
        const downloads = shortNumerals(await MidiaCache.countDownloads(video_id));
        const copyMsg = await ctx.telegram.copyMessage(ctx.from.id, midia.repo_id, midia.message_id, {
            parse_mode: 'Markdown',
            caption: `📥 ${downloads} Download(s)\n\n*Made by ⚡️ @${ctx.botInfo.username}*`,
            reply_markup: { inline_keyboard: [[{ text, url }]] }
        });
        await ctx.setMessageReaction(ctx.from.id, copyMsg.message_id, "⚡");
        await MidiaCache.addDownload(video_id);
        return;
    }

    if (await redisProcesses(queueKey).count() >= 1) {
        let countProcess = await redisProcesses(queueKey).count();

        await editOrSendMessage(ctx, null, lang('process_exceeded', langCode, {
            count: countProcess
        }), {}, true, downloadingKey);
        return;
    }

    const yt5Class = new YT5s(`https://www.youtube.com/watch?v=${video_id}`);
    const fetchMusic = new YoutubeAudio(video_id);
    await editOrSendMessage(ctx, null, lang('downloading', langCode), {}, true, downloadingKey);
    const join_link = await getInviteLinks(ctx);

    fetchMusic.downloadMusic(video_id, vip)
        .then(async (processQueue) => {
            await redisProcesses(queueKey).add(processQueue.processId); // Add +1 processo para o usuario.
            redisRemember(progresskey, async () => ({
                message_id: await redisRecovery(downloadingKey), time: Date.now()
            }));

            processQueue.progress(async ({ porcentagem, baixado, velocidade, converting }) => {
                lastProgress = await redisRecovery(progresskey), now = Date.now();

                if (!lastProgress || (now - lastProgress.time) >= 2500) {
                    const statusLang = (converting == true) ? 'converting' : (vip ? 'downloading_progress_vip' : 'downloading_progress');
                    const text = lang(statusLang, langCode, { progress: porcentagem, speed: velocidade, join_link });

                    await editOrSendMessage(ctx, null, text, { disable_web_page_preview: true }, true, downloadingKey)
                        .then(async ({ message_id }) => {
                            await redisClient.set(progresskey, JSON.stringify({ message_id, time: now }))
                        });
                }
            }).onComplete(async ({ file_name, source, thumbnail, folder_download, size, createdAt, extra }) => {
                const text = lang('share_this_bot', langCode), url = lang('share_link', langCode, { username: ctx.botInfo.username });

                // Deleta a mensagem de download.
                try { await ctx.deleteMessage(await redisRecovery(downloadingKey)) }
                catch (error) { Logger.error(error); }

                try {
                    ctx.chat.id = env('CACHE_CHANNEL');

                    await sendAudioOrVideo(ctx, source, {
                        title: extra.title,
                        performer: extra.artist,
                        thumbnail: { source: thumbnail },
                        duration: extra.duration,
                        caption: `Enviado por *${ctx.chat.first_name} ${ctx.chat?.last_name || ''}*`,
                        parse_mode: 'Markdown',
                    }).then(async ({ message_id, audio }) => {
                        try {
                            await MidiaCache.createMidia({
                                title: `${extra.title} - ${extra.artist || ''}`,
                                file_id: audio.file_id,
                                id_telegram: ctx.from.id,
                                repo_id: env('CACHE_CHANNEL'),
                                message_id: message_id,
                                youtube_id: video_id
                            });

                            await MidiaCache.addDownload(video_id);
                        } catch (error) {
                            Logger.error(error);
                        }

                        await ctx.sendChatAction('upload_voice');
                        // Copia do canal de cache, Envia para usuario
                        const copyMsg = await ctx.telegram.copyMessage(ctx.from.id, env('CACHE_CHANNEL'), message_id, {
                            parse_mode: 'Markdown',
                            caption: `*Made by ⚡️ @${ctx.botInfo.username}*`,
                            reply_markup: {
                                inline_keyboard: [[{ text, url }]]
                            }
                        });

                        await ctx.setMessageReaction(ctx.from.id, copyMsg.message_id, "😁");
                    });
                } catch (error) {
                    Logger.error(error);
                    ctx.chat.id = ctx.from.id;
                    await editOrSendMessage(ctx, null, lang('error_upload', langCode), {}, true, downloadingKey);
                }

                try {
                    folder_download && fs.rm(folder_download, { recursive: true }, (err) => err && console.error(err.message));
                } catch (error) { }

                await redisProcesses(queueKey).rem(processQueue.processId); // Remove -1 processo para o usuario.
                redisClient.del(progresskey); // Remove o cache de controle progresso.
                redisClient.del(`VIDEO_DATA:${video_id}`)
            }).onError(async (error) => {
                await yt5Class.onProgress(async (progress) => {
                    try {
                        const lastProgress = await redisRecovery(progresskey);
                        const now = Date.now();

                        // Verifica se a última atualização foi há mais de 2 segundos
                        if (!lastProgress || (now - parseInt(lastProgress.time)) >= 2000) {
                            const text = lang('converting', langCode, { progress, speed: 0, join_link });
                            await editOrSendMessage(ctx, null, text, { disable_web_page_preview: true }, true, downloadingKey)
                                .then(async ({ message_id }) => {
                                    await redisClient.set(progresskey, JSON.stringify({ message_id, time: Date.now() }));
                                });
                        }
                    } catch (error) {
                        console.error('Erro ao atualizar progresso:', error);
                    }
                }).onComplete(async ({ file, size }) => {
                    // console.log('DATA:', file, size);
                    const path_parts = file.split('/');
                    const bin_name = path_parts[path_parts.length - 2] || 'download';
                    const file_name = path_parts[path_parts.length - 1] || 'download';
                    const api_url = 'https://filebin.net';
                    const text = lang('converting', langCode, { progress: 100, speed: 0, join_link });
                    const shareText = lang('share_this_bot', langCode), shareUrl = lang('share_link', langCode, { username: ctx.botInfo.username });
                    await editOrSendMessage(ctx, null, text, { disable_web_page_preview: true }, true, downloadingKey)
                        .then(async ({ message_id }) => await redisClient.set(progresskey, JSON.stringify({ message_id, time: Date.now() })));
                    try {
                        // Tamanho maior que 50mb
                        if (size >= 52428800) {
                            await editOrSendMessage(ctx, null, lang('big_file', langCode), {}, true, downloadingKey);

                            try {
                                const { httpCode, headers, body } = await curlRequest(`${api_url}/${bin_name}/${formatFilename(file_name)}`, 'POST', { input_file: file }, {
                                    'accept': 'application/json',
                                    'cid': '@YoutubeMusicBetaBot',
                                    'Content-Type': 'application/octet-stream'
                                });

                                if (httpCode === 201) {
                                    const description = lang('link_file_download', langCode)
                                        + `\n\n• 📄 \`${body.file.filename}\` (${body.file.bytes_readable})`
                                        + `\n• 🔗 [Download Link](${api_url}/${bin_name})`
                                        + `\n• ⏳ _${body.bin.expired_at_relative}_`;

                                    await editOrSendMessage(ctx, null, description, {
                                        reply_markup: {
                                            inline_keyboard: [
                                                [{ text: shareText, url: shareUrl }],
                                                [{ text: 'Download Link', url: `${api_url}/${bin_name}` }]
                                            ]
                                        }
                                    }, true, downloadingKey).then(async ({ message_id }) => await ctx.setMessageReaction(ctx.from.id, message_id, "😁"));

                                    redisClient.del(progresskey); // Remove o cache de controle progresso.
                                    redisClient.del(`VIDEO_DATA:${video_id}`)
                                }
                            } catch (error) {
                                Logger.error(error);

                                ctx.chat.id = ctx.from.id;
                                await editOrSendMessage(ctx, null, lang('error_upload', langCode), {}, true, downloadingKey);
                            }
                        } else {
                            try { await ctx.deleteMessage(await redisRecovery(downloadingKey)); } catch (error) { Logger.error(error) }
                            try {
                                const ext = file.slice(-4).toLowerCase();
                                const chatAction = ['.mp3', '.m4a', '.wav'].includes(ext) ? 'upload_voice' : ['.mp4', '.mkv'].includes(ext) ? 'upload_video' : '';

                                if (chatAction === 'upload_voice') {
                                    ctx.chat.id = env('CACHE_CHANNEL');
                                }

                                // Preparar os parâmetros comuns para sendAudioOrVideo
                                const commonParams = {
                                    caption: chatAction === 'upload_voice' ? `Enviado por *${ctx.chat.first_name} ${ctx.chat?.last_name || ''}*` : `*Made by ⚡️ @${ctx.botInfo.username}*`,
                                    duration: videoData.data.duration,
                                    performer: videoData.data.channel,
                                    title: videoData.data.title,
                                    thumbnail: { url: `https://i.ytimg.com/vi/${video_id}/default.jpg` },
                                    parse_mode: 'Markdown',
                                    type: chatAction === 'upload_video' ? 'video' : 'audio'
                                };

                                // Adicionar reply_markup apenas se não for 'upload_voice'
                                if (chatAction !== 'upload_voice') {
                                    commonParams.reply_markup = { inline_keyboard: [[{ text: shareText, url: shareUrl }]] };
                                }

                                // Se for audio manda para canal de cache! Se não envia sem fazer cache.
                                await sendAudioOrVideo(ctx, file, commonParams)
                                    .then(async ({ message_id, audio }) => {
                                        // Copia do canal de cache, Envia para usuario
                                        if (chatAction === 'upload_voice') {
                                            try {
                                                await MidiaCache.createMidia({
                                                    title: `${videoData.data.title} - ${videoData.data.artist || ''}`,
                                                    file_id: audio.file_id,
                                                    id_telegram: ctx.from.id,
                                                    repo_id: env('CACHE_CHANNEL'),
                                                    message_id: message_id,
                                                    youtube_id: video_id
                                                })

                                                await MidiaCache.addDownload(video_id);
                                            } catch (error) {
                                                console.error(error);
                                                Logger.error(error);
                                            }

                                            await ctx.sendChatAction(chatAction);

                                            // Copia do canal de cache, Envia para usuario
                                            const copyMsg = await ctx.telegram.copyMessage(ctx.from.id, env('CACHE_CHANNEL'), message_id, {
                                                parse_mode: 'Markdown',
                                                caption: `*Made by ⚡️ @${ctx.botInfo.username}*`,
                                                reply_markup: {
                                                    inline_keyboard: [[{ text: shareText, url: shareUrl }]]
                                                }
                                            });

                                            await ctx.setMessageReaction(ctx.from.id, copyMsg.message_id, "😁");
                                        } else {
                                            await ctx.setMessageReaction(ctx.from.id, message_id, "😁")
                                        }
                                    });

                                redisClient.del(progresskey); // Remove o cache de controle progresso.
                                redisClient.del(`VIDEO_DATA:${video_id}`)
                            } catch (error) {
                                console.error(error)

                                ctx.chat.id = ctx.from.id;
                                await editOrSendMessage(ctx, null, lang('error_upload', langCode), {}, true, downloadingKey);
                            }
                        }
                    } catch (error) {
                        console.error('Erro ao verificar o tamanho do arquivo:', error);
                    }
                }).onError(async (message, error) => {
                    Logger.error(message, error);
                    ctx.chat.id = ctx.from.id;
                    await editOrSendMessage(ctx, null, lang('error_upload', langCode), {}, true, downloadingKey);
                }).download('mp3', 128, `yt5s.io-${videoData.data.title}`)
                    .finally(async () => {
                        redisClient.del(progresskey); // Remove o cache de controle progresso.
                        await redisProcesses(queueKey).rem(video_id); // Remove -1 processo para o usuario.
                        await redisProcesses(queueKey).rem(processQueue.processId); // Remove -1 processo para o usuario.
                    })
                Logger.error(error);
                await redisProcesses(queueKey).rem(video_id); // Remove -1 processo para o usuario.
                await redisProcesses(queueKey).rem(processQueue.processId); // Remove -1 processo para o usuario.
            })
        })
}

/**
 * Busca músicas usando uma query fornecida pelo usuário, combinando resultados do cache local e uma fonte externa. Prioriza músicas do cache, exclui duplicatas pelo youtube_id, e envia respostas paginadas da query inline.
 * 
 * @param {import('telegraf').Context} ctx - Contexto do Telegraf com informações da query inline e do usuário.
 * @param {string} inlineQuery - Query de busca do usuário.
 * @returns {Promise<void>} Promessa resolvida com o envio da resposta da query inline.
 * 
 * @async
 * Verifica o tamanho da query (> 3 caracteres) e o debounce time antes de buscar. Combina resultados do cache e externos, excluindo duplicatas, para a resposta.
 */
async function inlineMusicSearch(ctx, inlineQuery) {
    const PAGE_SIZE = 4;
    const DEBOUNCE_TIME = 1000;
    const query = inlineQuery.toLowerCase();
    const offset = parseInt(ctx.inlineQuery.offset) || 0;
    const userId = ctx.from.id;
    const langCode = await User.getLang(userId);
    const text = lang('share_this_bot', langCode), url = lang('share_link', langCode, { username: ctx.botInfo.username });

    if (query.length < 3) {
        return ctx.answerInlineQuery([], {
            switch_pm_text: lang('inline_enter_search', this.lang),
            switch_pm_parameter: 'search'
        });
    }

    const lastSearchTime = await redisClient.get(`LAST_INLINE_SEARCH:${userId}`);
    const currentTime = Date.now();

    if (lastSearchTime && currentTime - lastSearchTime < DEBOUNCE_TIME) {
        return;
    }

    await redisClient.setEx(`LAST_INLINE_SEARCH:${userId}`, 120, currentTime.toString());

    // Busca músicas no cache
    const cachedMusics = await MidiaCache.getByTitle(query);
    let cachedResults = cachedMusics.map((music) => ({
        type: 'audio',
        id: String(music.id),
        audio_file_id: music.file_id,
        youtube_id: music.youtube_id,
        title: music.title,
        downloads: music.downloads
    }));

    let searchResult = await searchMusics(query);
    searchResult = searchResult.filter(item => !cachedMusics.some(cached => cached.youtube_id === item.youtubeId));

    let externalResults = searchResult.map((item) => ({
        type: 'article',
        id: item.youtubeId,
        title: item.title,
        description: `• Artist: ${item.artists.map(artist => artist.name).join(', ') || 'N/A'}`
            + `\n• Album: ${item.album || 'N/A'}`
            + `\n• Duration: ${item.duration.label || '0:00'}`,
        thumb_url: item.thumbnailUrl,
        hide_url: true,
        url: `https://www.youtube.com/embed/${item.youtubeId}`,
        input_message_content: {
            message_text: `https://music.youtube.com/watch?v=${item.youtubeId}`,
        },
    }));

    let combinedResults = [...cachedResults.map(result => ({
        type: result.type,
        id: result.id,
        audio_file_id: result.audio_file_id,
        parse_mode: 'Markdown',
        caption: `📥 ${shortNumerals(result.downloads)} Download(s)\n\n*Made by ⚡️ @${ctx.botInfo.username}*`,
        reply_markup: {
            inline_keyboard: [[{ text, url }]]
        },
    })), ...externalResults];

    const paginatedResults = combinedResults.slice(offset, offset + PAGE_SIZE);
    const nextOffset = offset + PAGE_SIZE < combinedResults.length ? offset + PAGE_SIZE : '';

    return await ctx.telegram.answerInlineQuery(ctx.inlineQuery.id, paginatedResults, {
        cache_time: 60,
        next_offset: nextOffset.toString(),
    });
}

module.exports = {
    fetchVideoOptions,
    mediaDownload,
    musicDownload,
    inlineMusicSearch,
    specialRegex
};