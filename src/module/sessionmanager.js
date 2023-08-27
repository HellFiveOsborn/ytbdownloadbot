const Database = require('better-sqlite3');
const { resolve_path } = require('./functions');
const path = require('path');


/**
 * Classe para gerenciar sessões em um banco de dados SQLite.
 */
class SessionManager {
    /**
     * Cria uma nova instância de SessionManager.
     * @param {sqlite3.Database} db - O objeto do banco de dados SQLite.
     */
    constructor(db) {
        if (!db) {
            db = path.join(resolve_path('database'), 'sessions.sqlite');
        }
        this.db = new Database(db);
        this.initDatabase();
    }

    /**
     * Inicializa o banco de dados criando a tabela de sessões, se ela não existir.
     */
    initDatabase() {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS sessions (
                chat_id INTEGER PRIMARY KEY,
                data TEXT,
                expiration INTEGER
            )
        `;

        this.db.exec(createTableSQL);
    }

    /**
     * Define uma sessão para o chatId especificado.
     * @param {string} chatId - O identificador do chat.
     * @param {object} data - Os dados da sessão a serem armazenados.
     */
    set(chatId, data, expiration = null) {
        const insertSQL = `
            INSERT INTO sessions (chat_id, data, expiration)
            VALUES (?, ?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET data=excluded.data, expiration=excluded.expiration
        `;

        const stmt = this.db.prepare(insertSQL);
        stmt.run(chatId, JSON.stringify(data), expiration);
    }

    /**
     * Define uma sessão com expiração para o chatId especificado.
     * @param {string} chatId - O identificador do chat.
     * @param {object} data - Os dados da sessão a serem armazenados.
     * @param {number} exp - O tempo de expiração em milissegundos.
     */
    setEx(chatId, data, exp) {
        const expiration = exp ? (Date.now() + exp) : null;
        this.set(chatId, data, expiration);

        if (expiration) {
            // Agendar a exclusão após o tempo de expiração
            setTimeout(() => {
                this.delete(chatId);
            }, exp);
        }
    }

    /**
     * Exclui uma sessão ou uma chave específica dentro de uma sessão.
     * @param {string} chatId - O identificador do chat.
     * @param {string|null} key - A chave específica a ser excluída (opcional).
     */
    delete(chatId, key = null) {
        const sessionData = this.get(chatId) || {}; // Obtém os dados da sessão ou cria um objeto vazio

        if (key) {
            // Delete a chave específica dentro da sessão
            delete sessionData[key];

            // Atualiza a sessão com os novos dados
            this.update(chatId, sessionData);
        } else {
            // Deleta a sessão inteira
            const deleteSessionSQL = `
                DELETE FROM sessions
                WHERE chat_id = ?
            `;

            this.db.prepare(deleteSessionSQL).run(chatId);
        }
    }

    /**
     * Atualiza uma sessão ou uma chave específica dentro de uma sessão.
     * @param {string} chatId - O identificador do chat.
     * @param {string|object} dataOrKey - Os dados ou a chave a serem atualizados.
     * @param {any} [value=null] - O novo valor (opcional).
     */
    update(chatId, dataOrKey, value = null) {
        if (typeof dataOrKey === 'string') {
            // Atualiza uma chave específica
            let sessionData = this.get(chatId) || {}; // Obtém os dados da sessão ou cria um objeto vazio
            sessionData[dataOrKey] = value; // Define o novo valor para a chave

            // Atualiza a sessão com os novos dados
            const updateSessionSQL = `
                UPDATE sessions
                SET data = ?
                WHERE chat_id = ?
            `;

            this.db.prepare(updateSessionSQL).run(JSON.stringify(sessionData), chatId);
        } else {
            // Atualiza todas as chaves na sessão
            const updateDataSQL = `
                UPDATE sessions
                SET data = ?
                WHERE chat_id = ?
            `;

            this.db.prepare(updateDataSQL).run(JSON.stringify(dataOrKey), chatId);
        }
    }

    /**
     * Obtém uma sessão ou uma chave específica dentro de uma sessão.
     * @param {string} chatId - O identificador do chat.
     * @param {string|null} [key=null] - A chave específica a ser obtida (opcional).
     * @returns {object|null|any} - Os dados da sessão, a chave específica ou null se não encontrado.
     */
    get(chatId, key = null) {
        const selectSQL = `
            SELECT data FROM sessions
            WHERE chat_id = ?
        `;

        const row = this.db.prepare(selectSQL).get(chatId);

        if (!row) {
            return null;
        }

        const sessionData = JSON.parse(row.data);

        if (key) {
            return sessionData[key];
        } else {
            return sessionData;
        }
    }

    /**
     * Verifica se uma sessão existe para o chatId especificado.
     * @param {string} chatId - O identificador do chat.
     * @returns {boolean} - True se a sessão existe, False caso contrário.
     */
    exists(chatId) {
        const selectSQL = `
            SELECT COUNT(*) as count FROM sessions
            WHERE chat_id = ?
        `;

        const row = this.db.prepare(selectSQL).get(chatId);

        return row && row.count > 0;
    }

    /**
     * Verifica se uma chave específica existe dentro de uma sessão.
     * @param {string} chatId - O identificador do chat.
     * @param {string} key - A chave a ser verificada.
     * @returns {boolean} - True se a chave existe na sessão, False caso contrário.
     */
    existsKey(chatId, key) {
        const selectSQL = `
            SELECT data FROM sessions
            WHERE chat_id = ?
        `;

        const row = this.db.prepare(selectSQL).get(chatId);

        if (!row) {
            return false;
        }

        const sessionData = JSON.parse(row.data);
        return sessionData.hasOwnProperty(key);
    }
}

module.exports = SessionManager;
