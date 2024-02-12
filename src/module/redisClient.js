require('dotenv').config({ path: '../../.env', encoding: 'utf-8' });
const redis = require('redis');

// Verifica se a URL do Redis está definida nas variáveis de ambiente
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
    console.error('A variável de ambiente REDIS_URL não está definida.');
    process.exit(1); // Encerra o processo se a URL do Redis não estiver definida
}

const client = redis.createClient({
    url: redisUrl,
});

client.connect();

client.on('error', (err) => {
    console.error('Erro ao conectar no Redis:', err);
});

module.exports = client;
