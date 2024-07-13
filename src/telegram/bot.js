const redisClient = require('../module/redisClient');
const sequelize = require('../../database/connection');

const { Telegraf } = require('telegraf');

const { User, MidiaCache } = require('../../models');

const { YoutubeVideo } = require('../module/ytdownloader');
const { specialRegex } = require('./commands/download');

const { lang, Logger, updateTypeOrigin, env, callCommand, redisRemember, sleep, isUserInGroupOrChannel, editOrSendMessage } = require('../module/functions');

class TelegramBot {
	constructor() {
		this.bot = new Telegraf(process.env.BOT_TOKEN);
		this.lang = 'en';

		// Sincronizar Models
		(async () => await sequelize.sync({ force: true, logging: false }))();
	}

	middlewares() {
		// Middleware para sair de grupos não permitidos
		this.bot.use(async (ctx, next) => {
			const chat_id = ctx.chat?.id;
			const title = ctx.chat?.title;

			// Sai de grupo/canais não autorizados!
			if (
				['group', 'channel', 'chat_member'].includes(updateTypeOrigin(ctx)) &&
				env('CHATS_AllOWED').includes(chat_id) !== true
			) {
				await ctx.telegram.leaveChat(chat_id)
					.then((result) => Logger.debug(`Saindo do grupo/canal: ${title || chat_id}`))
					.catch((data) => Logger.error(`Erro ao sair do grupo/canal: ${title || chat_id}`))
				return;
			}

			await next();
		});

		// Middleware para responder somente chats privados
		this.bot.use(async (ctx, next) => {
			if (['private', 'inline'].includes(updateTypeOrigin(ctx))) {
				await next();
			}
		});

		// Midleware para avisar que estamos em manutenção.
		this.bot.use(async (ctx, next) => {
			this.lang = await User.getLang(ctx.from?.id) || 'en';
			if (env('NODE_ENV') === 'development' && !env('ADMIN').includes(ctx.from?.id)) {
				if (ctx.message) return ctx.reply(lang('maintenance', this.lang));
				ctx.callbackQuery?.id && ctx.answerCbQuery(lang('maintenance', this.lang));
				ctx.inlineQuery?.id && ctx.answerInlineQuery([], {
					switch_pm_text: lang('maintenance', this.lang),
					switch_pm_parameter: 'search'
				});
				return;
			}
			await next();
		});

		// Middleware para obter o idioma do usuário.
		this.bot.use(async (ctx, next) => {
			const chat_id = ctx?.from?.id;
			await User.getUser({ id_telegram: chat_id, lang: ctx.from.language_code });
			this.lang = await User.getLang(chat_id);
			await next();
		});

		// Middleware para atualizar placeholder lista de comandos
		this.bot.use(async (ctx, next) => {
			ctx.telegram.setMyCommands(lang('commands', this.lang));
			await next();
		});

		// Middleware para barrar usuários banidos no banco de dados
		this.bot.use(async (ctx, next) => {
			const isBanned = await User.isBanned(ctx.from.id);
			if (!env('ADMIN').includes(ctx.from.id) && isBanned) {
				return;
			}
			await next();
		});

		// Middleware para controlar a frequência de mensagens dos usuários
		this.bot.use(async (ctx, next) => {
			if (updateTypeOrigin(ctx) === 'private' && ctx.message) {
				const chat_id = ctx.from.id;

				await User.getUser({ id_telegram: chat_id, lang: ctx.from.language_code });
				const limitRPS = 3, banDuration = 3600, now = Math.floor(Date.now() / 1000);

				// Tenta recuperar o cacheCount como uma string JSON
				const cacheCountJson = await redisClient.get(`ANTI_SPAM_COOLDOWN:${chat_id}`);
				let cacheCount = cacheCountJson ? JSON.parse(cacheCountJson) : null;
				let messages = cacheCount ? parseInt(cacheCount.messages) : 0;
				let timestamp = cacheCount ? parseInt(cacheCount.timestamp) : now;

				// Reseta a contagem se passou 1 segundo desde a última mensagem
				messages = (now - timestamp >= 1) ? 1 : messages + 1;

				// Atualiza o cache com o novo estado
				await redisClient.set(`ANTI_SPAM_COOLDOWN:${chat_id}`, JSON.stringify({ messages, timestamp: now }));

				const isBanned = await redisClient.get(`TEMPORARILY_BANNED:${chat_id}`) !== null;
				const banEnd = isBanned ? parseInt(await redisClient.get(`TEMPORARILY_BANNED:${chat_id}`)) : 0;

				if (isBanned && now > banEnd) {
					await redisClient.del(`TEMPORARILY_BANNED:${chat_id}`);
					await ctx.reply("You have been unbanned and can send messages again.");
				} else if (!isBanned && messages > limitRPS) {
					await redisClient.set(`TEMPORARILY_BANNED:${chat_id}`, now + banDuration, 'EX', banDuration);
					await ctx.reply(lang('you_banned', this.lang), {
						parse_mode: 'Markdown',
					});
				}

				// Bloqueia a execução se o usuário estiver banido
				if (isBanned && now <= banEnd) return;
			}

			await next();
		});

		// Middleware para adicionar um setMessageReaction ao ctx
		this.bot.use((ctx, next) => {
			ctx.setMessageReaction = async function (chat_id = null, message_id, reaction, is_big = false) {
				try {
					return await ctx.telegram.callApi('setMessageReaction', {
						chat_id: chat_id || ctx.chat.id,
						message_id,
						reaction: JSON.stringify([{ type: 'emoji', emoji: reaction, }]),
						is_big: is_big
					});
				} catch (error) {
					Logger.error('Erro ao definir a reação', error)
					return false;
				}
			};

			return next();
		});

		// Middleware para adicionar um addDownload ao audio resgatado do cache
		this.bot.use(async (ctx, next) => {
			this.bot.on('audio', async (ctx) => {
				if (ctx.message.via_bot && ctx.message.via_bot.id === ctx.botInfo.id) {
					const musicIdentifier = `${ctx.message.audio.title} - ${ctx.message.audio.performer}`;
					await MidiaCache.addDownload(musicIdentifier);
					await ctx.setMessageReaction(ctx.from.id, ctx.message.message_id, "⚡");
				}
			});

			await next();
		});
	}

	inline() {
		this.bot.inlineQuery(async (inlineQuery, ctx) => callCommand('download', ctx, 'inlineMusicSearch', inlineQuery));
	}

	commands() {
		this.bot.start(async (ctx) => await callCommand('start', ctx));
		this.bot.help(async (ctx) => await callCommand('help', ctx));
		this.bot.command('lang', async (ctx) => await callCommand('lang', ctx, 'getLangs'))
		this.bot.action(/setlang\s(.+)/, async (ctx) => await callCommand('lang', ctx, 'setLang', ctx.match[1]));
		this.bot.command(/(?<command>ban|desban)(?:\s+(?<id_telegram>\d+))?/, async (ctx) => await callCommand('admin', ctx, 'banOrUnban'))
		this.bot.command(/report|relatorio/, async (ctx) => await callCommand('admin', ctx, 'getReport'));

		this.bot.hears(specialRegex.youtube, async (ctx) => {
			const chat_id = ctx.from.id;
			const { video_id } = ctx.match.groups;

			if (!video_id) {
				ctx.reply(lang('invalid_link', this.lang), { parse_mode: 'Markdown' });
				return;
			}

			const fetchVideo = new YoutubeVideo(video_id);

			await redisClient.setEx(
				`DOWNLOADING_LAST_MSG:${chat_id}:${video_id}`,
				120,
				(await ctx.reply(lang('waiting_for_info', this.lang), { parse_mode: 'Markdown' })).message_id.toString()
			);

			const videoData = await redisRemember(`VIDEO_DATA:${video_id}`, async () => await fetchVideo.getData(), 900);

			switch (videoData.type) {
				case 'video':
					await editOrSendMessage(ctx, null, lang('waiting_qualities', this.lang), {}, true, `DOWNLOADING_LAST_MSG:${chat_id}:${video_id}`);
					await sleep(1500);
					await callCommand('download', ctx, 'fetchVideoOptions', video_id);
					break;
				case 'music':
					await callCommand('download', ctx, 'musicDownload', video_id);
					break;
				default:
					await ctx.reply(lang('invalid_link', this.lang), { parse_mode: 'Markdown' });
					break;
			}
		});

		this.bot.action(specialRegex.callback_download, async (ctx) => {
			const vip = await isUserInGroupOrChannel(ctx);

			if (ctx.match.groups?.vipmode && !vip) {
				ctx.answerCbQuery(lang('vip_only', this.lang), { show_alert: true });
				return;
			}

			await ctx.answerCbQuery();

			const { video_id } = ctx.match.groups;

			if (!video_id) {
				ctx.reply(lang('invalid_link', this.lang), { parse_mode: 'Markdown' });
				return;
			}

			await callCommand('download', ctx, 'mediaDownload', ctx.match.groups);
		});

		this.bot.action(specialRegex.summarize, async (ctx) => await callCommand('summarize', ctx, 'sendSummarize', ctx.match.groups));

		// Fallback
		this.bot.drop(async (ctx) => {
			if (ctx.callbackQuery?.id) {
				await ctx.answerCbQuery();
			}

			if (ctx.message?.audio || ctx.message?.video) {
				ctx.setMessageReaction(ctx.from.id, ctx.message.message_id, "🔥");
				return;
			}

			if (updateTypeOrigin(ctx) === 'private' && ctx.message?.text) {
				ctx.reply(lang('invalid_link', this.lang), { parse_mode: 'Markdown' });
			}
		});
	}

	run(webhook = false) {
		this.bot.catch(async (error, ctx) => {
			// Reporta o erro ao admin
			ctx.telegram.sendMessage(
				env('CACHE_CHANNEL'),
				`<b>Error:</b>`
				+ `<pre><code class="language-text">${error}</code></pre>`
				+ `<b>User:</b> ${ctx.from?.first_name} (${ctx.from?.id})\n`
				+ `Typed: ${ctx.message?.text || 'N/A'}`,
				{ parse_mode: 'HTML' }
			).catch(err => {
				// Log caso a tentativa de envio de mensagem falhe
				Logger.error('Failed to send error report to Telegram:', err.stack || err);
			});
		});

		this.middlewares();
		this.inline();
		this.commands();

		if (webhook) {
			(async () => {
				const result = await this.bot.telegram.setWebhook(process.env.BOT_WEBHOOK, {
					drop_pending_updates: process.env.NODE_ENV === 'development' ? true : false,
				});
				return result;
			})().then(async result => {
				await this.bot.startWebhook('/', null, process.env.BOT_WEBHOOK_PORT);
				console.info(result ? `\x1b[32m✓ Webhook is running!\x1b[0m` : `\x1b[31m× Error on setWebhook\x1b[0m`);
			});
			return;
		}

		console.info('✅ Bot is running Longpolling!');

		// Longpolling
		this.bot.launch();
	}

	instance() {
		return this.bot;
	}
}

module.exports = TelegramBot;