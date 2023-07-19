const { Telegraf } = require('telegraf');
const { Audio } = require('../module/ytdownloader');
const fs = require('fs');
const path = require('path');

class TelegramBot {
	constructor(db) {
		this.db = db;
		this.bot = new Telegraf(process.env.bot_token);
		this.loading = new Map();
	}

	middlewares() {
		this.bot.use(async (ctx, next) => {
		  if (ctx.updateType === 'channel_post' && ctx.update.channel_post.new_chat_members) {
		    const chatId = ctx.chat.id;
		    const isBotAdded = ctx.update.channel_post.new_chat_members.some(member => member.is_bot && member.username === bot.options.username);

		    if (isBotAdded && chatId !== process.env.backup_channel_id) {
		      try {
		        await ctx.telegram.leaveChat(chatId);
		      } catch (error) {
		        console.error('Erro ao sair do canal ou grupo:', error);
		      }
		    }
		  }

		  next();
		});
	}

	async loadingMsg(ctx, { emojis, message }) {
	  const userLoading = {
	    lastMsg: await this.bot.telegram.sendMessage(ctx.message.chat.id, `${emojis[0]} ${message}`),
	    interval: null
	  };
	  
	  this.loading.set(ctx.from.id, userLoading);

	  let i = 0;

	  userLoading.interval = setInterval(async () => {
	    i = (i + 1) % emojis.length;

	    try {
	    	await this.bot.telegram.editMessageText(userLoading.lastMsg.chat.id, userLoading.lastMsg.message_id, undefined, `${emojis[i]} ${message}`);
	    } catch (err) {
	    	if (err) {
	    		console.error(err);
	    		return;
	    	}
	    }
	    
	    if (i === this.maxTimes - 1) {
	      clearLoading(ctx); 
	    }
	  }, 1500);
	}

	async stopLoading(ctx) {
	  const userLoading = this.loading.get(ctx.chat.id);

	  clearInterval(userLoading.interval);
	  await this.bot.telegram.deleteMessage(userLoading.lastMsg.chat.id, userLoading.lastMsg.message_id);
	  this.loading.delete(ctx.chat.id);
	}

	commands() {
		this.bot.start(ctx => {
		  const chatId = ctx.chat.id;

		  // Verifica se o usuário já existe no banco de dados
		  const existingUser = this.db.prepare('SELECT chat_id FROM usuarios WHERE chat_id = ?').get(chatId);

		  if (!existingUser) {
		    // Registra o novo usuário no banco de dados
		    this.db.prepare('INSERT INTO usuarios (chat_id, lang, registro, status) VALUES (?, ?, ?, ?)')
		      .run(chatId, null, new Date().toISOString(), 1);
		  }

		  ctx.reply(`👋 Olá, seja bem-vindo! Envie o link do vídeo/música que deseja baixar:`);
		});

		this.bot.on('text', async (ctx) => {
		  const match = ctx.message.text.match(/(?:https?:\/\/)?(?:www\.)?youtu(?:\.be\/|be.com\/\S*(?:watch|embed)(?:(?:(?=\/[-a-zA-Z0-9_]{11,}(?!\S))\/)|(?:\S*v=|v\/)))([-a-zA-Z0-9_]{11,})/);
		  
		  if (!match) {
		    ctx.reply('⚠️ Por favor, envie um link válido do YouTube/Music.\nEx: `https://music.youtube.com/watch?v=hqGOsVJ7hWg`');
		    return;
		  }

		  const videoId = match[1];
		  const music = new Audio().setUrl(`https://music.youtube.com/watch?v=${videoId}`);

		  // Inicia o pre-loading
		  this.loadingMsg(ctx, { emojis: ['🌝','🌔','🌓','🌒','🌚'], message: 'Obtendo informações' });
		  const result = await music.getInfo();
		  await this.stopLoading(ctx); // Encerra o anterior

		  if (!result.track) {
		  	console.log(result);

			ctx.reply('❌ Não e possivel fazer o download, certifique-se que é uma musica!\nEx: `https://music.youtube.com/watch?v=hqGOsVJ7hWg`', {
				parse_mode: 'Markdown'
			});

			return;
		  }

		  // Verifica se o videoId já existe na tabela "musicas"
		  const existingAudio = this.db.prepare('SELECT file_id, chat_id FROM musicas WHERE ytb_id = ?').get(videoId);

		  if (existingAudio) {
		    // Encaminha o áudio para o usuário atual
		    ctx.sendAudio(existingAudio.file_id, {
		        caption: "**Made by ⚡️ @YoutubeMusicBetaBot**",
		        parse_mode: 'Markdown'
		    })
		  } else {
		    // Inicia o pre-loading
		    this.loadingMsg(ctx, { emojis: ['📥', '📤'], message: 'Baixando a musica.' });

		    music.download()
		    .then(async response => {
		      // Envia o áudio para o canal de backup
		      ctx.replyWithAudio({ source: response.song_path }, {
			      	chat_id: process.env.backup_channel_id,
			        performer: response.artist,
			        title: response.title,
			        duration: response.duration,
			        thumbnail: response.thumbnail,
			        caption: "**Made by ⚡️ @YoutubeMusicBetaBot**",
			        parse_mode: 'Markdown'
			      })
			      .then(async (message) => {
			      	await this.stopLoading(ctx); // Encerra o anterior

			        // Registra o áudio na tabela "musicas"
			        this.db.prepare('INSERT INTO musicas (chat_id, user_id, file_id, ytb_id, reqs, registro) VALUES (?, ?, ?, ?, ?, ?)')
			          .run(process.env.backup_channel_id, ctx.from.id, message.audio.file_id, videoId, 0, new Date().toISOString());

			        // Inicia o pre-loading
		    		this.loadingMsg(ctx, { emojis: ['📥', '📤'], message: 'Enviando a musica.' });

			        // Inicia a ação de chat "enviando arquivo"
			    	ctx.sendChatAction('upload_audio');

			        // Encaminha o áudio do canal de backup para o usuário atual
			        await ctx.telegram.forwardMessage(ctx.from.id, process.env.backup_channel_id, message.message_id);

			        // Encerra o pre-loading
				    await this.stopLoading(ctx);

			        // Encerra a ação de chat "enviando arquivo"
				    ctx.sendChatAction('cancel');
			      })
			      .catch(error => {
			        console.error('Erro ao enviar o áudio para o canal de backup:', error);
			      })
			      .finally(async () => {
				    // Exclui o arquivo da pasta após o envio para o Telegram
					fs.rm(response.path, { recursive: true }, (err) => {
						if (err) {
						  console.error(err.message);
						  return;
						}

						console.info(`\nPASTA DELETADA\n`);
					});
				  });
		    })
		    .catch(async (erro) => {
		      	// Encerra o pre-loading
		    	await this.stopLoading(ctx);

				ctx.reply('❌ Ocorreu um erro, tente novamente!', {
					parse_mode: 'Markdown'
				});

		    	console.error(erro);
		    });
		  }
		});
	}

	run(webhook=false) {
		this.middlewares();
		this.commands();

		if (webhook) {
	  		//this.bot.telegram.setWebhook(process.env.webhook_url);
			const status = this.bot.startWebhook('/', null, process.env.webhook_port);

			console.log('Webhook is running!');

			return;
		}

		console.log('\nBot is running with long polling!\n');

	  	// Longpolling
		this.bot.launch();
	}
}

module.exports = TelegramBot;