require('dotenv').config();
const redisClient = require('./src/module/redisClient');
const sequelize = require('./database/connection');
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
                message: "<b>🐹 Hamster Kombat: O game mais hypado do Telegram! 🔥</b><a href=\"https://i.ibb.co/mvYpcs0/becomeaceo.jpg\">⠀</a>\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">Junte-se agora</a> e torne-se o CEO de uma criptoexchange! 🚀\n\n"
                    + "<b>🎁 Bônus Exclusivos:</b>\n"
                    + "- 🪙 <b>5.000 Moedas</b> de boas-vindas.\n"
                    + "- 🔥 <b>25.000 Moedas</b> para usuários Telegram Premium.\n\n"
                    + "<b>🌟 Dica de Mestre:</b>\n"
                    + "- <b>Foque em upgrades de cartas especiais e combos</b> para aumentar seu lucro por hora. 📈\n"
                    + "- <b>Monitore diariamente as novas cartas</b> e otimize suas estratégias. 🎴\n\n"
                    + "<b>💡 Lembre-se:</b>\n"
                    + "- <b>Aumentar o lucro por hora</b> é crucial. 💰\n"
                    + "- <b>Combine e otimize suas cartas</b> para maximizar ganhos. 🛠️\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">Comece agora</a> e domine o Hamster Kombat! 🎮🚀",
                button: {
                    inline_keyboard: [
                        [{ text: '🚀 Começar a jogar', url: 'https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670' }],
                        [{ text: 'Bot automático', url: 'https://t.me/hamsterkombatupbot?start=256311670' }]
                    ]
                }
            },
            'en': {
                message: "<b>🐹 Hamster Kombat: The most hyped game on Telegram! 🔥</b><a href=\"https://i.ibb.co/mvYpcs0/becomeaceo.jpg\">⠀</a>\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">Join now</a> and become the CEO of a cryptoexchange! 🚀\n\n"
                    + "<b>🎁 Exclusive Bonuses:</b>\n"
                    + "- 🪙 <b>5,000 Coins</b> as a welcome gift.\n"
                    + "- 🔥 <b>25,000 Coins</b> for Telegram Premium users.\n\n"
                    + "<b>🌟 Master Tip:</b>\n"
                    + "- <b>Focus on upgrades of special cards and combos</b> to increase your hourly profit. 📈\n"
                    + "- <b>Monitor new cards daily</b> and optimize your strategies. 🎴\n\n"
                    + "<b>💡 Remember:</b>\n"
                    + "- <b>Increasing hourly profit</b> is crucial. 💰\n"
                    + "- <b>Combine and optimize your cards</b> to maximize gains. 🛠️\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">Start now</a> and master Hamster Kombat! 🎮🚀",
                button: {
                    inline_keyboard: [
                        [{ text: '🚀 Start Playing', url: 'https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670' }],
                        [{ text: 'Automatic Bot', url: 'https://t.me/hamsterkombatupbot?start=256311670' }]
                    ]
                }
            },
            'es': {
                message: "<b>🐹 Hamster Kombat: ¡El juego más emocionante de Telegram! 🔥</b><a href=\"https://i.ibb.co/mvYpcs0/becomeaceo.jpg\">⠀</a>\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">Únete ahora</a> y conviértete en el CEO de una criptoexchange! 🚀\n\n"
                    + "<b>🎁 Bonificaciones Exclusivas:</b>\n"
                    + "- 🪙 <b>5.000 Monedas</b> como bienvenida.\n"
                    + "- 🔥 <b>25.000 Monedas</b> para usuarios de Telegram Premium.\n\n"
                    + "<b>🌟 Consejo de Maestro:</b>\n"
                    + "- <b>Enfócate en mejoras de cartas especiales y combos</b> para aumentar tu beneficio por hora. 📈\n"
                    + "- <b>Monitorea diariamente las nuevas cartas</b> y optimiza tus estrategias. 🎴\n\n"
                    + "<b>💡 Recuerda:</b>\n"
                    + "- <b>Aumentar el beneficio por hora</b> es crucial. 💰\n"
                    + "- <b>Combina y optimiza tus cartas</b> para maximizar las ganancias. 🛠️\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">Comienza ahora</a> y domina Hamster Kombat! 🎮🚀",
                button: {
                    inline_keyboard: [
                        [{ text: '🚀 Empezar a jugar', url: 'https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670' }],
                        [{ text: 'Bot automático', url: 'https://t.me/hamsterkombatupbot?start=256311670' }]
                    ]
                }
            },
            'zh-hant': {
                message: "<b>🐹 Hamster Kombat: Telegram 上最熱門的遊戲！🔥</b><a href=\"https://i.ibb.co/mvYpcs0/becomeaceo.jpg\">⠀</a>\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">立即加入</a> 並成為加密貨幣交易所的CEO！🚀\n\n"
                    + "<b>🎁 獨家獎金：</b>\n"
                    + "- 🪙 <b>5,000 枚硬幣</b> 作為歡迎禮。\n"
                    + "- 🔥 <b>25,000 枚硬幣</b> 給 Telegram Premium 用戶。\n\n"
                    + "<b>🌟 大師提示：</b>\n"
                    + "- <b>專注於特殊卡片和組合的升級</b> 以增加每小時的利潤。📈\n"
                    + "- <b>每天監控新卡片</b> 並優化您的策略。🎴\n\n"
                    + "<b>💡 記住：</b>\n"
                    + "- <b>增加每小時的利潤</b> 是關鍵。💰\n"
                    + "- <b>結合並優化您的卡片</b> 以最大化收益。🛠️\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">現在開始</a> 並掌握 Hamster Kombat！🎮🚀",
                button: {
                    inline_keyboard: [
                        [{ text: '🚀 開始遊戲', url: 'https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670' }],
                        [{ text: '自動機器人', url: 'https://t.me/hamsterkombatupbot?start=256311670' }]
                    ]
                }
            },
            'zh-hans': {
                message: "<b>🐹 Hamster Kombat: Telegram 上最热门的游戏！🔥</b><a href=\"https://i.ibb.co/mvYpcs0/becomeaceo.jpg\">⠀</a>\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">立即加入</a> 并成为加密货币交易所的CEO！🚀\n\n"
                    + "<b>🎁 独家奖金：</b>\n"
                    + "- 🪙 <b>5,000 枚硬币</b> 作为欢迎礼。\n"
                    + "- 🔥 <b>25,000 枚硬币</b> 给 Telegram Premium 用户。\n\n"
                    + "<b>🌟 大师提示：</b>\n"
                    + "- <b>专注于特殊卡片和组合的升级</b> 以增加每小时的利润。📈\n"
                    + "- <b>每天监控新卡片</b> 并优化您的策略。🎴\n\n"
                    + "<b>💡 记住：</b>\n"
                    + "- <b>增加每小时的利润</b> 是关键。💰\n"
                    + "- <b>结合并优化您的卡片</b> 以最大化收益。🛠️\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">现在开始</a> 并掌握 Hamster Kombat！🎮🚀",
                button: {
                    inline_keyboard: [
                        [{ text: '🚀 开始游戏', url: 'https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670' }],
                        [{ text: '自动机器人', url: 'https://t.me/hamsterkombatupbot?start=256311670' }]
                    ]
                }
            },
            'ru': {
                message: "<b>🐹 Hamster Kombat: Самый ожидаемый игровой бот в Telegram! 🔥</b><a href=\"https://i.ibb.co/mvYpcs0/becomeaceo.jpg\">⠀</a>\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">Присоединяйтесь сейчас</a> и станьте CEO криптобиржи! 🚀\n\n"
                    + "<b>🎁 Эксклюзивные Бонусы:</b>\n"
                    + "- 🪙 <b>5 000 Монет</b> в качестве приветственного подарка.\n"
                    + "- 🔥 <b>25 000 Монет</b> для пользователей Telegram Premium.\n\n"
                    + "<b>🌟 Совет Мастера:</b>\n"
                    + "- <b>Сосредоточьтесь на улучшении специальных карт и комбинаций</b> для увеличения вашей прибыли в час. 📈\n"
                    + "- <b>Ежедневно отслеживайте новые карты</b> и оптимизируйте свои стратегии. 🎴\n\n"
                    + "<b>💡 Помните:</b>\n"
                    + "- <b>Увеличение часовой прибыли</b> имеет решающее значение. 💰\n"
                    + "- <b>Комбинируйте и оптимизируйте свои карты</b> для максимизации доходов. 🛠️\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">Начните сейчас</a> и покорите Hamster Kombat! 🎮🚀",
                button: {
                    inline_keyboard: [
                        [{ text: '🚀 Начать играть', url: 'https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670' }],
                        [{ text: 'Автоматический бот', url: 'https://t.me/hamsterkombatupbot?start=256311670' }]
                    ]
                }
            },
            'tr': {
                message: "<b>🐹 Hamster Kombat: Telegram'ın en beklenen oyunu! 🔥</b><a href=\"https://i.ibb.co/mvYpcs0/becomeaceo.jpg\">⠀</a>\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">Şimdi katılın</a> ve bir kripto borsasının CEO'su olun! 🚀\n\n"
                    + "<b>🎁 Özel Bonuslar:</b>\n"
                    + "- 🪙 <b>5.000 Jeton</b> hoş geldin hediyesi.\n"
                    + "- 🔥 <b>25.000 Jeton</b> Telegram Premium kullanıcıları için.\n\n"
                    + "<b>🌟 Usta İpucu:</b>\n"
                    + "- <b>Özel kartların ve kombinasyonların yükseltmelerine odaklanın</b> saatlik kazancınızı artırmak için. 📈\n"
                    + "- <b>Yeni kartları günlük takip edin</b> ve stratejilerinizi optimize edin. 🎴\n\n"
                    + "<b>💡 Unutmayın:</b>\n"
                    + "- <b>Saatlik kazancı artırmak</b> çok önemlidir. 💰\n"
                    + "- <b>Kartlarınızı birleştirin ve optimize edin</b> kazançlarınızı maksimize etmek için. 🛠️\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">Şimdi başlayın</a> ve Hamster Kombat'ı fethedin! 🎮🚀",
                button: {
                    inline_keyboard: [
                        [{ text: '🚀 Oyuna Başla', url: 'https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670' }],
                        [{ text: 'Otomatik Bot', url: 'https://t.me/hamsterkombatupbot?start=256311670' }]
                    ]
                }
            },
            'it': {
                message: "<b>🐹 Hamster Kombat: Il gioco più atteso su Telegram! 🔥</b><a href=\"https://i.ibb.co/mvYpcs0/becomeaceo.jpg\">⠀</a>\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">Unisciti ora</a> e diventa il CEO di una criptoexchange! 🚀\n\n"
                    + "<b>🎁 Bonus Esclusivi:</b>\n"
                    + "- 🪙 <b>5.000 Monete</b> di benvenuto.\n"
                    + "- 🔥 <b>25.000 Monete</b> per utenti Telegram Premium.\n\n"
                    + "<b>🌟 Consiglio del Maestro:</b>\n"
                    + "- <b>Concentrati sugli upgrade di carte speciali e combo</b> per aumentare il tuo profitto orario. 📈\n"
                    + "- <b>Monitora quotidianamente le nuove carte</b> e ottimizza le tue strategie. 🎴\n\n"
                    + "<b>💡 Ricorda:</b>\n"
                    + "- <b>Aumentare il profitto orario</b> è cruciale. 💰\n"
                    + "- <b>Combina e ottimizza le tue carte</b> per massimizzare i guadagni. 🛠️\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">Inizia ora</a> e domina Hamster Kombat! 🎮🚀",
                button: {
                    inline_keyboard: [
                        [{ text: '🚀 Inizia a giocare', url: 'https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670' }],
                        [{ text: 'Bot automatico', url: 'https://t.me/hamsterkombatupbot?start=256311670' }]
                    ]
                }
            },
            'id': {
                message: "<b>🐹 Hamster Kombat: Game paling ditunggu di Telegram! 🔥</b><a href=\"https://i.ibb.co/mvYpcs0/becomeaceo.jpg\">⠀</a>\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">Gabung sekarang</a> dan menjadi CEO dari sebuah kriptoexchange! 🚀\n\n"
                    + "<b>🎁 Bonus Eksklusif:</b>\n"
                    + "- 🪙 <b>5.000 Koin</b> sebagai hadiah selamat datang.\n"
                    + "- 🔥 <b>25.000 Koin</b> untuk pengguna Telegram Premium.\n\n"
                    + "<b>🌟 Tips dari Master:</b>\n"
                    + "- <b>Fokus pada upgrade kartu spesial dan kombo</b> untuk meningkatkan keuntungan per jam Anda. 📈\n"
                    + "- <b>Pantau setiap hari kartu-kartu baru</b> dan optimalkan strategi Anda. 🎴\n\n"
                    + "<b>💡 Ingat:</b>\n"
                    + "- <b>Meningkatkan keuntungan per jam</b> sangat penting. 💰\n"
                    + "- <b>Kombinasikan dan optimalkan kartu Anda</b> untuk memaksimalkan keuntungan. 🛠️\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">Mulai sekarang</a> dan taklukkan Hamster Kombat! 🎮🚀",
                button: {
                    inline_keyboard: [
                        [{ text: '🚀 Mulai bermain', url: 'https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670' }],
                        [{ text: 'Bot otomatis', url: 'https://t.me/hamsterkombatupbot?start=256311670' }]
                    ]
                }
            },
            'fr': {
                message: "<b>🐹 Hamster Kombat: Le jeu le plus attendu sur Telegram! 🔥</b><a href=\"https://i.ibb.co/mvYpcs0/becomeaceo.jpg\">⠀</a>\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">Rejoignez maintenant</a> et devenez le PDG d'une cryptoexchange! 🚀\n\n"
                    + "<b>🎁 Bonus Exclusifs:</b>\n"
                    + "- 🪙 <b>5 000 Pièces</b> en cadeau de bienvenue.\n"
                    + "- 🔥 <b>25 000 Pièces</b> pour les utilisateurs Telegram Premium.\n\n"
                    + "<b>🌟 Conseil de Maître:</b>\n"
                    + "- <b>Concentrez-vous sur les mises à niveau de cartes spéciales et de combinaisons</b> pour augmenter votre profit par heure. 📈\n"
                    + "- <b>Surveillez quotidiennement les nouvelles cartes</b> et optimisez vos stratégies. 🎴\n\n"
                    + "<b>💡 Rappelez-vous:</b>\n"
                    + "- <b>Augmenter le profit par heure</b> est crucial. 💰\n"
                    + "- <b>Combinez et optimisez vos cartes</b> pour maximiser les gains. 🛠️\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">Commencez maintenant</a> et maîtrisez Hamster Kombat! 🎮🚀",
                button: {
                    inline_keyboard: [
                        [{ text: '🚀 Commencer à jouer', url: 'https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670' }],
                        [{ text: 'Bot automatique', url: 'https://t.me/hamsterkombatupbot?start=256311670' }]
                    ]
                }
            },
            'hi': {
                message: "<b>🐹 हैमस्टर कॉम्बैट: टेलीग्राम का सबसे हाइप्ड गेम! 🔥</b><a href=\"https://i.ibb.co/mvYpcs0/becomeaceo.jpg\">⠀</a>\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">अभी शामिल हों</a> और एक क्रिप्टो एक्सचेंज के CEO बनें! 🚀\n\n"
                    + "<b>🎁 विशेष बोनस:</b>\n"
                    + "- 🪙 <b>5,000 सिक्के</b> स्वागत उपहार के रूप में।\n"
                    + "- 🔥 <b>25,000 सिक्के</b> टेलीग्राम प्रीमियम उपयोगकर्ताओं के लिए।\n\n"
                    + "<b>🌟 मास्टर की सलाह:</b>\n"
                    + "- <b>विशेष कार्ड और कॉम्बो के अपग्रेड पर ध्यान केंद्रित करें</b> अपने प्रति घंटा लाभ को बढ़ाने के लिए। 📈\n"
                    + "- <b>नए कार्डों को दैनिक रूप से निगरानी करें</b> और अपनी रणनीतियों को अनुकूलित करें। 🎴\n\n"
                    + "<b>💡 याद रखें:</b>\n"
                    + "- <b>प्रति घंटा लाभ बढ़ाना</b> महत्वपूर्ण है। 💰\n"
                    + "- <b>अपने कार्डों को संयोजित करें और अनुकूलित करें</b> लाभ को अधिकतम करने के लिए। 🛠️\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">अभी शुरू करें</a> और हैमस्टर कॉम्बैट को शासित करें! 🎮🚀",
                button: {
                    inline_keyboard: [
                        [{ text: '🚀 खेलना शुरू करें', url: 'https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670' }],
                        [{ text: 'स्वचालित बॉट', url: 'https://t.me/hamsterkombatupbot?start=256311670' }]
                    ]
                }
            },
            'ar': {
                message: "<b>🐹 Hamster Kombat: أكثر لعبة منتظرة في Telegram! 🔥</b><a href=\"https://i.ibb.co/mvYpcs0/becomeaceo.jpg\">⠀</a>\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">انضم الآن</a> وأصبح CEO لبورصة عملات رقمية! 🚀\n\n"
                    + "<b>🎁 مكافآت حصرية:</b>\n"
                    + "- 🪙 <b>5,000 عملة</b> كميرا حيا عليك.\n"
                    + "- 🔥 <b>25,000 عملة</b> لمستخدمي Telegram Premium.\n\n"
                    + "<b>🌟 نصيحة الماجستير:</b>\n"
                    + "- <b>ركز على ترقيات البطاقات الخاصة والتوليفات</b> لزيادة الربح في الساعة. 📈\n"
                    + "- <b>راقب البطاقات الجديدة يوميًا</b> وأضفف تحسينات على استراتيجياتك. 🎴\n\n"
                    + "<b>💡 تذكر:</b>\n"
                    + "- <b>زيادة الربح في الساعة</b> أمر حاسم. 💰\n"
                    + "- <b>اجمع وأضفف تحسينات على بطاقاتك</b> لتعظيم الأرباح. 🛠️\n\n"
                    + "<a href=\"https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670\">ابدأ الآن</a> وسيطر على Hamster Kombat! 🎮🚀",
                button: {
                    inline_keyboard: [
                        [{ text: '🚀 ابدأ اللعب', url: 'https://t.me/hAmster_kombat_bot/start?startapp=kentId256311670' }],
                        [{ text: 'بوت تلقائي', url: 'https://t.me/hamsterkombatupbot?start=256311670' }]
                    ]
                }
            },
        };

        try {
            // Sincronizar Models
            await sequelize.sync();

            // Obter todos os usuários
            const users = await User.findAll({
                where: {
                    status: true,
                    //id_telegram: '256311670'
                },
                order: [
                    ['createdAt', 'DESC']
                ]
            });

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