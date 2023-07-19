require('dotenv').config();

const Database = require('better-sqlite3');

// Abre o banco de dados SQLite
const db = new Database('database.db');
const TelegramBot = require('./src/telegram/bot');

// Run's
const Telegram = new TelegramBot(db);
Telegram.run(false);


// // Cria a tabela "usuarios"
// db.exec(`
//   CREATE TABLE IF NOT EXISTS usuarios (
//     chat_id INTEGER PRIMARY KEY NOT NULL,
//     lang TEXT,
//     registro TIMESTAMP,
//     status INTEGER
//   )
// `);

// // Cria a tabela "musicas"
// db.exec(`
//   CREATE TABLE IF NOT EXISTS musicas (
//     chat_id INTEGER NOT NULL,
//     user_id INTEGER NOT NULL,
//     file_id TEXT NOT NULL,
//     ytb_id TEXT NOT NULL,
//     reqs INTEGER DEFAULT 0,
//     registro TIMESTAMP,
//     FOREIGN KEY (user_id) REFERENCES usuarios(chat_id)
//   )
// `);

// // Fecha a conexão com o banco de dados (opcional)
// db.close();