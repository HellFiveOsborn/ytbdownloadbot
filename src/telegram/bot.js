const Database = require('better-sqlite3');
const { Telegraf } = require('telegraf');

const fs = require('fs');
const path = require('path');

const { resolve_path, env, saveLog, isBanned, lang, usuario, editOrSendMessage, updateTypeOrigin } = require('../module/functions');

const SessionManager = require('../module/sessionmanager');
const { Audio, Video } = require('../module/ytdownloader');

// Comandos
const { getTotalUsuarios, getTotalMusicas, banirOuDesbanirUsuario } = require('./commands/admin');
const { getFormatosButtons, baixarMusica, baixarMidia, forwardCacheMusica, limiteProcessos } = require('./commands/download');
const startCmd = require('../telegram/commands/start');
const helpCmd = require('../telegram/commands/help');
const { langsCmd, setLang } = require('../telegram/commands/lang');
const killQueueCmd = require('./commands/kill');

class TelegramBot {
	constructor() {
		this.db = new Database(resolve_path('database/bot.sqlite'));
		this.bot = new Telegraf(env('bot_token'));
		this.cache = new SessionManager(), this.cache.initDatabase();

		// Inicializa as tabelas caso não exista.
		this.initDatabase();
	}

	middlewares() {
		let contagemMensagens = {};

		this.bot.use(async (ctx, next) => {
			const limiteMensagens = 2; // Limite de mensagens em um curto período
			const limiteTempo = 1; // Limite de tempo em segundos (1 minuto)
			const limiteStatus = 0; // Status a ser definido se o limite for excedido

			const chat_id = ctx.from.id;
			const agora = Math.floor(Date.now() / 1000); // Tempo atual em segundos

			// Verifica se o chat_id já está na contagem de mensagens
			if (!contagemMensagens[chat_id]) {
				contagemMensagens[chat_id] = { mensagens: 0, timestamp: agora };
			}

			const atividadeCache = this.cache.get(chat_id, 'atividade_cache');

			// Verifica se o limite de tempo foi excedido
			if (agora - contagemMensagens[chat_id].timestamp >= limiteTempo) {
				// Redefine a contagem de mensagens e o timestamp se o limite de tempo foi excedido
				contagemMensagens[chat_id] = { mensagens: 0, timestamp: agora };
			}

			// Verifica se o usuário está banido (status 0) e se passou uma hora
			if (atividadeCache && agora - atividadeCache.timestamp >= 60) { // 3600
				// Atualiza o status para 1
				this.db.prepare('UPDATE usuarios SET status = 1 WHERE chat_id = ?').run(chat_id);

				// Remove o cache de atividade
				this.cache.delete(chat_id, 'atividade_cache');
				this.cache.delete(chat_id, 'msg_banido');
			}

			// Incrementa a contagem de mensagens
			contagemMensagens[chat_id].mensagens++;

			// Verifica se o limite de mensagens foi excedido
			if (contagemMensagens[chat_id].mensagens > limiteMensagens) {
				// Define o status do usuário como o limiteStatus se o limite de mensagens foi excedido
				this.db.prepare('UPDATE usuarios SET status = ? WHERE chat_id = ?').run(limiteStatus, chat_id);

				// Define o cache de atividade para controlar o tempo
				this.cache.update(chat_id, 'atividade_cache', { timestamp: agora });
			}

			// Continue para o próximo middleware ou manipulador
			await next();
		});


		this.bot.use(async (ctx, next) => {
			const chat_id = ctx.chat.id;
			const user = usuario(ctx)
			const langCode = user ? user.lang : 'en';

			// Canais não autorizados
			if (ctx.update.my_chat_member && !env('canais_permitidos').includes(chat_id)) {
				await ctx.telegram.leaveChat(chat_id)
					.then((resp) => saveLog(`Saindo do grupo/canal: ${ctx.chat.title}`))
					.catch((data) => saveLog(`Erro ao sair do grupo/canal: ${ctx.chat.title}`, 'erros'))

				return;
			}

			// Reporte de log's
			saveLog(ctx.update);

			if (updateTypeOrigin(ctx) !== 'private') return;

			if (!this.cache.exists(chat_id)) {
				this.cache.set(chat_id, {}, null);
			}

			// Usuarios banidos
			if (isBanned(ctx, this.db) && chat_id != env('admin')) {
				// Verifica se existe a chave 'msg_banido' no cache
				if (this.cache.existsKey(chat_id, 'msg_banido')) {
					const lastMsgTime = new Date(this.cache.get(chat_id, 'msg_banido'));
					const currentTime = new Date();
					const oneDay = 24 * 60 * 60 * 1000; // Um dia em milissegundos

					// Verifica se passou pelo menos um dia desde a última mensagem
					if (currentTime - lastMsgTime >= oneDay) {
						ctx.reply(lang('you_banned', langCode))
							.then(() => {
								// Atualiza a chave 'msg_banido' com o novo tempo
								this.cache.update(chat_id, 'msg_banido', currentTime);
							});
					}
				} else {
					// Se a chave 'msg_banido' não existir, envie a mensagem e defina o tempo atual
					ctx.reply(lang('you_banned', langCode))
						.then(() => {
							const currentTime = new Date();
							this.cache.update(chat_id, 'msg_banido', currentTime);
						});
				}
				return;
			}

			ctx.telegram.setMyCommands(lang('commands', langCode), {
				language_code: langCode,
			})

			next();
		});
	}

	/**
	 * Inicializa o banco de dados criando as tabela do bot, se ela não existir.
	 */
	initDatabase() {
		this.db.transaction(() => {
			this.db.exec(`
                CREATE TABLE IF NOT EXISTS usuarios (
                    chat_id INTEGER PRIMARY KEY NOT NULL,
                    lang TEXT DEFAULT "en",
                    registro TIMESTAMP,
                    status INTEGER
                )
            `);

			this.db.exec(`
                CREATE TABLE IF NOT EXISTS musicas (
                    chat_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    file_id TEXT NOT NULL,
                    ytb_id TEXT NOT NULL,
                    downloads INTEGER DEFAULT 0,
                    metadata TEXT,
                    thumbnail TEXT, 
                    registro TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES usuarios(chat_id)
                )
            `);

			this.db.exec(`
                CREATE TABLE IF NOT EXISTS outros (
                    chat_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    file_id TEXT NOT NULL,
                    ytb_id TEXT NOT NULL,
                    formato TEXT,
                    qualidade TEXT,
                    downloads INTEGER DEFAULT 0,
                    metadata TEXT,
                    registro TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES usuarios(chat_id)
                )
            `);
		})();
	}

	commands() {
		this.bot.start(ctx => startCmd(ctx, this.db));
		this.bot.help(ctx => helpCmd(ctx, this.db));
		this.bot.command('lang', ctx => langsCmd(ctx, this.db, this.cache));
		this.bot.command('kill', ctx => killQueueCmd(ctx));

		// Admin
		this.bot.command('totalusuarios', ctx => getTotalUsuarios(ctx));
		this.bot.command('totalmusicas', ctx => getTotalMusicas(ctx));
		this.bot.command(['ban', 'desban'], ctx => banirOuDesbanirUsuario(ctx));

		this.bot.on('text', async (ctx) => {
			const chat_id = ctx.from.id;
			const text = ctx.message.text.trim();
			let user = usuario(ctx)
			const langCode = user.hasOwnProperty('lang') ? user.lang : 'en';

			const video = new Video();
			const music = new Audio();

			const extract = video.splitURL(text);
			const id_video = (extract) ? extract.videoId : null;

			if (id_video === null || id_video === undefined) {
				let text = lang('invalid_link', langCode)
				ctx.reply(text, { parse_mode: 'Markdown' });
				return;
			}

			video.setUrl(text); // Define a URL da midia!

			await forwardCacheMusica(ctx, id_video, async (ctx) => {
				await limiteProcessos(ctx, id_video, async () => {
					await ctx.reply(lang('waiting_for_info', langCode))
						.then(async (resp) => {
							this.cache.update(chat_id, 'ultima_msg', resp.message_id);

							let getTipo = await video.getTipo();
							this.cache.update(chat_id, `download_cache_${id_video}`, getTipo);

							if (getTipo.tipo === 'music') {
								await baixarMusica(ctx, music, id_video);
							}

							if (getTipo.tipo === 'video') {
								if (getTipo.informacoes.duration > 720) { // Video maior que 12min
									await editOrSendMessage(ctx, null, lang('time_exceeded', langCode, { minute: 12 }));
									return;
								}

								await editOrSendMessage(ctx, this.cache.get(chat_id, 'ultima_msg'), lang('waiting_qualities', langCode))
									.then(id => this.cache.update(chat_id, 'ultima_msg', id));

								await getFormatosButtons(ctx, { video, videoID: id_video });

								return;
							}
						})
				});
			});
		});

		this.bot.on('callback_query', async (ctx) => {
			const data = ctx.callbackQuery.data
			const params = data.includes(' ') ? data.split(' ') : {};

			if (params[0] == 'setlang') {
				setLang(ctx, this.db, this.cache, params[1]);
			}

			if (data === 'download_format') {
				return await ctx.answerCbQuery();
			}

			if (params) {
				switch (params[0]) {
					case 'download':
						await limiteProcessos(ctx, params[1], async () => await baixarMidia(ctx, params));
						break;
				}
			}
		});
	}

	run(webhook = false) {
		this.middlewares();
		this.commands();

		if (webhook) {
			//this.bot.telegram.setWebhook(process.env.webhook_url);
			const status = this.bot.startWebhook('/', null, process.env.webhook_port);

			console.log('Webhook is running!');

			return;
		}

		saveLog(`
#################################
#                               #
#       Youtube Music Bot       #
#                               #
#################################

Total users: ${this.db.prepare('SELECT * FROM usuarios').all().length}
Total music's: ${this.db.prepare('SELECT * FROM musicas').all().length}

Bot is running with long polling!\n`);

		// Longpolling
		this.bot.launch();
	}

	instance() {
		return this.bot;
	}
}

module.exports = TelegramBot;