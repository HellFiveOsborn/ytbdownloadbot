require('dotenv').config();
const redisClient = require('./src/module/redisClient');
const sequelize = require('./database/connection');
const { Op } = require('sequelize');
const { User } = require('./models');
const { Telegraf } = require('telegraf');

class sendAlert {
    constructor() {
        this.bot = new Telegraf(process.env.BOT_TOKEN);
    }

    async run() {
        // Mensagens de alerta em diferentes idiomas
        const alert_messages = {
            'pt-br': {
                message: '📢 <b>Aviso Importante</b>\n\n'
                    + 'Nosso bot está <b>parcialmente online</b> novamente! 🎉\n\n'
                    + '<blockquote>⚠️ O YouTube está bloqueando muitos bots/sites de download de vídeos, então você ainda pode encontrar erros de upload. Tente novamente em alguns minutos ou busque o vídeo/música em outro canal. 🎵</blockquote>\n\n'
                    + '🐺 <b>Entre no nosso canal</b> para informações importantes sobre o bot! 😊',
                button: {
                    inline_keyboard: [
                        [{ text: '⭐️ Compartilhe', url: 'https://t.me/share/url?url=https://t.me/YoutubeMusicBetaBot&text=📥%20Baixe%20vídeos/músicas%20com%20o%20Youtube%20Music%20Bot' }],
                        [{ text: '🎪 Canal @OsbornBots', url: 'https://t.me/OsbornBots' }]
                    ]
                }
            },
            'en': {
                message: '📢 <b>Important Notice</b>\n\n'
                    + 'Our bot is <b>partially online</b> again! 🎉\n\n'
                    + '<blockquote>⚠️ YouTube is blocking many bot/video download sites, so you may still encounter upload errors. Try again in a few minutes or look for the video/music on another channel. 🎵</blockquote>\n\n'
                    + '🐺 <b>Join our channel</b> for important information about the bot! 😊',
                button: {
                    inline_keyboard: [
                        [{ text: '⭐️ Share', url: 'https://t.me/share/url?url=https://t.me/YoutubeMusicBetaBot&text=📥%20Download%20videos/music%20with%20the%20Youtube%20Music%20Bot' }],
                        [{ text: '🎪 Channel @OsbornBots', url: 'https://t.me/OsbornBots' }]
                    ]
                }
            },
            'es': {
                message: '📢 <b>Aviso Importante</b>\n\n'
                    + '¡Nuestro bot está <b>parcialmente en línea</b> nuevamente! 🎉\n\n'
                    + '<blockquote>⚠️ YouTube está bloqueando muchos bots/sitios de descarga de videos, por lo que aún puede encontrar errores de carga. Inténtelo de nuevo en unos minutos o busque el video/música en otro canal. 🎵</blockquote>\n\n'
                    + '🐺 <b>Únase a nuestro canal</b> para obtener información importante sobre el bot! 😊',
                button: {
                    inline_keyboard: [
                        [{ text: '⭐️ Compartir', url: 'https://t.me/share/url?url=https://t.me/YoutubeMusicBetaBot&text=📥%20Descarga%20videos/música%20con%20el%20Youtube%20Music%20Bot' }],
                        [{ text: '🎪 Canal @OsbornBots', url: 'https://t.me/OsbornBots' }]
                    ]
                }
            },
            'zh-hant': {
                message: '📢 <b>重要通知</b>\n\n'
                    + '我們的機器人已經<b>部分上線</b>了！ 🎉\n\n'
                    + '<blockquote>⚠️ YouTube正在封鎖許多機器人/視頻下載網站，因此您可能仍會遇到上傳錯誤。請在幾分鐘後重試或在其他頻道尋找視頻/音樂。 🎵</blockquote>\n\n'
                    + '🐺 <b>加入我們的頻道</b>以獲取有關機器人的重要信息！ 😊',
                button: {
                    inline_keyboard: [
                        [{ text: '⭐️ 分享', url: 'https://t.me/share/url?url=https://t.me/YoutubeMusicBetaBot&text=📥%20使用Youtube%20Music%20Bot下載視頻/音樂' }],
                        [{ text: '🎪 頻道 @OsbornBots', url: 'https://t.me/OsbornBots' }]
                    ]
                }
            },
            'zh-hans': {
                message: '📢 <b>重要通知</b>\n\n'
                    + '我们的机器人已经<b>部分上线</b>了！ 🎉\n\n'
                    + '<blockquote>⚠️ YouTube正在封锁许多机器人/视频下载网站，因此您可能仍会遇到上传错误。请在几分钟后重试或在其他频道寻找视频/音乐。 🎵</blockquote>\n\n'
                    + '🐺 <b>加入我们的频道</b>以获取有关机器人的重要信息！ 😊',
                button: {
                    inline_keyboard: [
                        [{ text: '⭐️ 分享', url: 'https://t.me/share/url?url=https://t.me/YoutubeMusicBetaBot&text=📥%20使用Youtube%20Music%20Bot下载视频/音乐' }],
                        [{ text: '🎪 频道 @OsbornBots', url: 'https://t.me/OsbornBots' }]
                    ]
                }
            },
            'ru': {
                message: '📢 <b>Важное объявление</b>\n\n'
                    + 'Наш бот снова <b>частично онлайн</b>! 🎉\n\n'
                    + '<blockquote>⚠️ YouTube блокирует многие боты/сайты для загрузки видео, поэтому вы все равно можете столкнуться с ошибками загрузки. Попробуйте снова через несколько минут или найдите видео/музыку на другом канале. 🎵</blockquote>\n\n'
                    + '🐺 <b>Присоединяйтесь к нашему каналу</b> для получения важной информации о боте! 😊',
                button: {
                    inline_keyboard: [
                        [{ text: '⭐️ Поделиться', url: 'https://t.me/share/url?url=https://t.me/YoutubeMusicBetaBot&text=📥%20Скачивайте%20видео/музыку%20с%20помощью%20Youtube%20Music%20Bot' }],
                        [{ text: '🎪 Канал @OsbornBots', url: 'https://t.me/OsbornBots' }]
                    ]
                }
            },
            'tr': {
                message: '📢 <b>Önemli Uyarı</b>\n\n'
                    + 'Botumuz tekrar <b>kısmen çevrimiçi</b>! 🎉\n\n'
                    + '<blockquote>⚠️ YouTube birçok bot/video indirme sitesini engelliyor, bu yüzden yükleme hatalarıyla karşılaşabilirsiniz. Birkaç dakika sonra tekrar deneyin veya videoyu/müziği başka bir kanaldan arayın. 🎵</blockquote>\n\n'
                    + '🐺 <b>Kanalımıza katılın</b> bot hakkında önemli bilgiler için! 😊',
                button: {
                    inline_keyboard: [
                        [{ text: '⭐️ Paylaş', url: 'https://t.me/share/url?url=https://t.me/YoutubeMusicBetaBot&text=📥%20Youtube%20Music%20Bot%20ile%20videolar/müzikler%20indir' }],
                        [{ text: '🎪 Kanal @OsbornBots', url: 'https://t.me/OsbornBots' }]
                    ]
                }
            },
            'it': {
                message: '📢 <b>Avviso Importante</b>\n\n'
                    + 'Il nostro bot è <b>parzialmente online</b> di nuovo! 🎉\n\n'
                    + '<blockquote>⚠️ YouTube sta bloccando molti bot/siti di download video, quindi potresti ancora incontrare errori di upload. Prova di nuovo tra qualche minuto o cerca il video/musica su un altro canale. 🎵</blockquote>\n\n'
                    + '🐺 <b>Unisciti al nostro canale</b> per informazioni importanti sul bot! 😊',
                button: {
                    inline_keyboard: [
                        [{ text: '⭐️ Condividi', url: 'https://t.me/share/url?url=https://t.me/YoutubeMusicBetaBot&text=📥%20Scarica%20video/musica%20con%20il%20Youtube%20Music%20Bot' }],
                        [{ text: '🎪 Canale @OsbornBots', url: 'https://t.me/OsbornBots' }]
                    ]
                }
            },
            'id': {
                message: '📢 <b>Pemberitahuan Penting</b>\n\n'
                    + 'Bot kami <b>sebagian online</b> lagi! 🎉\n\n'
                    + '<blockquote>⚠️ YouTube memblokir banyak bot/situs unduh video, jadi Anda masih mungkin menemukan kesalahan unggah. Cobalah lagi dalam beberapa menit atau cari video/musik di saluran lain. 🎵</blockquote>\n\n'
                    + '🐺 <b>Bergabunglah dengan saluran kami</b> untuk informasi penting tentang bot! 😊',
                button: {
                    inline_keyboard: [
                        [{ text: '⭐️ Bagikan', url: 'https://t.me/share/url?url=https://t.me/YoutubeMusicBetaBot&text=📥%20Unduh%20video/musik%20dengan%20Youtube%20Music%20Bot' }],
                        [{ text: '🎪 Kanal @OsbornBots', url: 'https://t.me/OsbornBots' }]
                    ]
                }
            },
            'fr': {
                message: '📢 <b>Avis Important</b>\n\n'
                    + 'Notre bot est <b>partiellement en ligne</b> à nouveau! 🎉\n\n'
                    + '<blockquote>⚠️ YouTube bloque de nombreux bots/sites de téléchargement de vidéos, vous pourriez donc encore rencontrer des erreurs de téléchargement. Réessayez dans quelques minutes ou cherchez la vidéo/musique sur un autre canal. 🎵</blockquote>\n\n'
                    + '🐺 <b>Rejoignez notre canal</b> pour des informations importantes sur le bot! 😊',
                button: {
                    inline_keyboard: [
                        [{ text: '⭐️ Partager', url: 'https://t.me/share/url?url=https://t.me/YoutubeMusicBetaBot&text=📥%20Téléchargez%20des%20vidéos/musique%20avec%20le%20Youtube%20Music%20Bot' }],
                        [{ text: '🎪 Canal @OsbornBots', url: 'https://t.me/OsbornBots' }]
                    ]
                }
            },
            'hi': {
                message: '📢 <b>महत्वपूर्ण सूचना</b>\n\n'
                    + 'हमारा बॉट <b>आंशिक रूप से ऑनलाइन</b> फिर से! 🎉\n\n'
                    + '<blockquote>⚠️ यूट्यूब बहुत सारे बॉट/वीडियो डाउनलोड साइट्स को ब्लॉक कर रहा है, इसलिए आपको अपलोड की समस्याएं अभी भी मिल सकती हैं। कुछ मिनट बाद पुनः प्रयास करें या वीडियो/संगीत को दूसरे चैनल पर खोजें। 🎵</blockquote>\n\n'
                    + '🐺 <b>हमारे चैनल में शामिल हों</b> बॉट के बारे में महत्वपूर्ण जानकारी के लिए! 😊',
                button: {
                    inline_keyboard: [
                        [{ text: '⭐️ साझा करें', url: 'https://t.me/share/url?url=https://t.me/YoutubeMusicBetaBot&text=📥%20Youtube%20Music%20Bot%20के%20साथ%20वीडियो/संगीत%20डाउनलोड%20करें' }],
                        [{ text: '🎪 चैनल @OsbornBots', url: 'https://t.me/OsbornBots' }]
                    ]
                }
            },
            'ar': {
                message: '📢 <b>تنبيه مهم</b>\n\n'
                    + 'بوتنا <b>جزئيًا على الإنترنت</b> مرة أخرى! 🎉\n\n'
                    + '<blockquote>⚠️ يوتيوب يحظر العديد من البوتات/مواقع تحميل الفيديو، لذا قد تواجه أخطاء تحميل. حاول مرة أخرى بعد بضع دقائق أو ابحث عن الفيديو/الموسيقى على قناة أخرى. 🎵</blockquote>\n\n'
                    + '🐺 <b>انضم إلى قناتنا</b> للحصول على معلومات مهمة حول البوت! 😊',
                button: {
                    inline_keyboard: [
                        [{ text: '⭐️ شارك', url: 'https://t.me/share/url?url=https://t.me/YoutubeMusicBetaBot&text=📥%20تنزيل%20الفيديوهات/الموسيقى%20باستخدام%20بوت%20Youtube%20Music' }],
                        [{ text: '🎪 قناة @OsbornBots', url: 'https://t.me/OsbornBots' }]
                    ]
                }
            },
        };

        try {
            // Sincronizar Models
            await sequelize.sync();

            const eightDaysAgo = new Date();
            eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

            // Obter todos os usuários
            const users = await User.findAll({
                where: {
                    status: true,
                    // id_telegram: 256311670,
                    // createdAt: {
                    //     [Op.gte]: eightDaysAgo,
                    // },
                },
                order: [['createdAt', 'DESC']]
            });

            // console.log('Usórios encontrados:', users.length);
            // process.exit();
            // return;

            // Percorrer cada usuário e enviar a mensagem
            for (const user of users) {
                const userLang = alert_messages[user.lang] || alert_messages['en'];
                const options = {
                    parse_mode: 'HTML',
                    ...(userLang.button && { reply_markup: userLang.button })
                };

                await this.sendMessage(user.id_telegram, userLang.message, options);

                // Esperar 1.5 segundos antes de enviar a próxima mensagem
                await new Promise(resolve => setTimeout(resolve, 1500));
            }

            console.log('Mensagens enviadas com sucesso!');

            // Stop the bot
            process.exit();
        } catch (error) {
            console.error('Erro ao enviar mensagens:', error);
        }
    }

    async sendMessage(chatId, message, options) {
        try {
            console.log(`• ${chatId}`);
            const response = await this.bot.telegram.sendMessage(chatId, message, options);
            await redisClient.setEx(`sendedAlert:${chatId}`, 3600, `${response.message_id}`); // Salva o message_id com uma expiração de 1 hora (3600 segundos)
        } catch (error) {
            if (error.response && error.response.error_code === 403) {
                console.log(`Não foi possível enviar mensagem para ${chatId}: O bot foi bloqueado pelo usuário.`);
            } else if (error.response && error.response.description.includes('too many requests')) {
                const waitTime = error.parameters.retry_after;
                console.log(`Limite da API do Telegram atingido. Por favor, aguarde ${waitTime} segundos.`);
                // Esperar o tempo sugerido pelo Telegram mais 1 segundo de margem
                await new Promise(resolve => setTimeout(resolve, (waitTime + 1) * 1000));
                // Tentar enviar a mensagem novamente após esperar
                await this.sendMessage(chatId, message, options);
            } else {
                console.error(`Erro inesperado ao enviar mensagem para ${chatId}:`, error);
            }
        }
    }

    async deleteMessage(chatId) {
        try {
            // Recupera o message_id do Redis
            const message_id = await redisClient.get(`sendedAlert:${chatId}`);

            // Verifica se o message_id foi encontrado
            if (message_id) {
                // Deleta a mensagem utilizando o message_id
                await this.bot.telegram.deleteMessage(chatId, message_id);

                // Remove a chave do Redis após deletar a mensagem
                await redisClient.del(`sendedAlert:${chatId}`);

                console.log(`• Mensagem com message_id ${message_id} deletada do chat ${chatId}.`);
            } else {
                console.log(`Não foi encontrado message_id para o chat ${chatId} no Redis.`);
            }
        } catch (error) {
            console.error(`Erro ao deletar mensagem do chat ${chatId}:`, error);
        }
    }
}


(new sendAlert()).run();