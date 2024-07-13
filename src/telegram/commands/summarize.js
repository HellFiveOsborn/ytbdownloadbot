const fetch = require('node-fetch');
const { User } = require('../../../models');
const { lang, Logger } = require('../../module/functions');
const convert = require('xml-js');
const fs = require('fs');

async function getYoutubeTranscript(videoId) {
    const apiUrl = `https://youtubetranscript.com/?server_vid2=${videoId}`;
    const response = await fetch(apiUrl);
    const xml = await response.text();
    const xmlDoc = convert.xml2js(xml, { compact: false, spaces: 4 });

    const transcriptElement = xmlDoc.elements[0].name === 'transcript';
    if (!transcriptElement) {
        const errorElement = xmlDoc.elements[0].name === 'error';
        if (errorElement) {
            throw new Error(errorElement.elements[0].text);
        } else {
            throw new Error("Unknown error");
        }
    }

    const textElements = xmlDoc.elements[0].elements.filter((element) => element.name === 'text');
    const transcriptText = textElements.map((textElement) => textElement.elements[0].text).join(" ");

    return transcriptText;
}

function extractJson(str) {
    const jsonRegex = /({.+})/;
    const jsonMatch = str.match(jsonRegex);

    try {
        return JSON.parse(str);
    } catch (error) {
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1]);
        } else {
            throw new Error('Could not extract JSON from string');
        }
    }
}

async function summarizeVideo(transcriptionText, langCode) {
    const apiEndpoint = 'https://www.blackbox.ai/api/chat';
    const sessionId = '8618bd78-1663-47a5-abcd-ec03bbca8b80';
    let lang = {
        'pt-br': 'Portuguese',
        'es': 'Spanish',
        'en': 'English',
        'zh-hans': 'Chinese',
    }
    lang = lang[langCode] || langCode;

    try {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                cookie: `sessionId=${sessionId};`
            },
            body: JSON.stringify({
                previewToken: null,
                userId: sessionId,
                codeModelMode: false,
                agentMode: {},
                trendingAgentMode: {},
                isMicMode: false,
                isChromeExt: false,
                githubToken: null,
                clickedAnswer2: false,
                clickedAnswer3: false,
                visitFromURL: null,
                messages: [{
                    id: 'YKAi4ka',
                    content: `#[INSTRUCTIONS]:\n`
                        + `— SYSTEM: You are an assistant to the YouTube Video Summary, you must respond only in the format provided and nothing more.\n\n`
                        + `#[OUTPUT]:\n`
                        + `— Format: JSON\n`
                        + `— Template: {"summarized": <TEXT>, "title": <GENERATED TITLE>}\n\n`
                        + `#[OUTPUT ERROR]:\n`
                        + `— Format: JSON\n`
                        + `— Format: {"error": <ERROR>}\n\n`
                        + `#[RULES]:\n`
                        + `— Reply this transcription in "${lang}" language\n\n`
                        + `— Translate to "${lang}"\n\n`
                        + `— Summary for up to 350 characters\n`
                        + `— If there is an error summarizing video, return {"error": "Could not summarize the video, try again!"} error message according to specified language.`
                        + `#TRANSCRIPTION: ${transcriptionText}\n\n`,
                    role: 'user'
                }]
            })
        });

        const responseBody = await response.text();
        const json = extractJson(responseBody);

        if (json.hasOwnProperty('summarized') && json?.summarized?.length > 0) {
            return {
                summarized: json.summarized,
                title: json?.title || null
            };
        } else {
            throw Error('Could not summarize the video, try again!')
        }
    } catch (error) {
        console.error(`Ocorreu um Error: ${error}`);
        throw Error('Could not summarize the video, try again!')
    }
}

/**
 * Obtém os dados do vídeo do YouTube.
 * 
 * @param {import('telegraf').Context} ctx - Contexto do Telegraf com informações da query inline e do usuário.
 * @param {string} video_id
 */
async function sendSummarize(ctx, { video_id }) {
    const chat_id = ctx.from.id;
    const langCode = await User.getLang(chat_id);

    ctx.answerCbQuery('✨ Summarizing Video')
    const messageResult = ctx.reply('✨ Summarizing Video');

    try {
        const transcript = await getYoutubeTranscript(video_id);
        const { summarized, title } = await summarizeVideo(transcript, langCode);

        if (summarized != undefined) {
            ctx.editMessageText(`${title ? `<b>${title}</b>\n\n` : ''}<i>${summarized}</i>`, {
                message_id: (await messageResult).message_id,
                parse_mode: 'HTML',
            })
        } else {
            throw Error("Could not summarize the video, try again!");
        }
    } catch (error) {
        ctx.editMessageText(error, {
            message_id: (await messageResult).message_id
        })
    }
}

module.exports = {
    sendSummarize
}