'use strict';
const { Model, Op } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MidiaCache extends Model {
    /**
     * Associa o modelo MidiaCache ao modelo User.
     * @static
     * @param {object} models Modelos disponíveis.
     */
    static associate(models) {
      MidiaCache.belongsTo(models.User, { foreignKey: 'id_telegram', as: 'user' });
    }

    /**
     * Cadastra uma nova mídia se não existir, utilizando os dados fornecidos.
     * @static
     * @param {object} data Dados necessários para o cadastro da mídia.
     * @param {string} data.file_id Identificador do arquivo da mídia.
     * @param {number|string} data.id_telegram Identificador único do Telegram para a mídia.
     * @param {number|string} data.repo_id Identificador do repositório associado à mídia.
     * @param {number|string} data.message_id Identificador da mensagem associada à mídia.
     * @param {string} data.youtube_id Identificador único do YouTube para a mídia.
     * @param {string} data.title Título da mídia. 
     * @returns {Promise<MidiaCache>} Uma promessa que resolve com a instância de MidiaCache cadastrada.
     */
    static async createMidia(data) {
      const midia = await MidiaCache.create(data);
      return midia;
    }

    /**
     * Remove uma mídia.
     * @static
     * @param {number|string} identifier Identificador da mídia (YouTube id, id, file_id).
     * @returns {Promise<number>} Número de registros deletados.
     */
    static async destroyMidia(identifier) {
      return MidiaCache.destroy({
        where: {
          [Op.or]: [
            { youtube_id: identifier },
            { id: identifier },
            { file_id: identifier }
          ]
        }
      });
    }

    static async getByTitle(title) {
      return await this.findAll({
        where: {
          title: {
            [Op.ne]: 'N/A' // Exclui resultados com título 'N/A'
          },
          title: {
            [Op.like]: `%${title}%`
          }
        },
        order: [['downloads', 'DESC']] // Ordena por downloads para trazer os mais populares primeiro
      });
    }

    /**
     * Obtém uma mídia pelo YouTube id, id ou file_id.
     * @static
     * @param {number|string} identifier Identificador da mídia.
     * @returns {Promise<MidiaCache|null>}
     */
    static async getMidia(identifier) {
      return MidiaCache.findOne({
        where: {
          [Op.or]: [
            { youtube_id: identifier },
            { id: identifier },
            { file_id: identifier }
          ]
        }
      });
    }

    /**
     * Incrementa o número de downloads de uma mídia.
     * @static
     * @param {number|string} identifier Identificador da mídia.
     * @returns {Promise<[number, MidiaCache[]]>}
     */
    static async addDownload(identifier) {
      return MidiaCache.increment('downloads', {
        by: 1,
        where: {
          [Op.or]: [
            { youtube_id: identifier },
            { id: identifier },
            { file_id: identifier },
            { title: identifier }
          ]
        }
      });
    }

    /**
     * Obtém o total de downloads de uma mídia.
     * @static
     * @param {number|string} identifier Identificador da mídia.
     * @returns {Promise<number>}
     */
    static async countDownloads(identifier) {
      const midia = await MidiaCache.findOne({
        where: {
          [Op.or]: [
            { youtube_id: identifier },
            { id: identifier },
            { file_id: identifier }
          ]
        },
        attributes: ['downloads']
      });
      return midia ? midia.downloads : 0;
    }

    static async getTopByDownloads(limit = 10) {
      return await this.findAll({
        order: [['downloads', 'DESC']],
        limit: limit
      });
    }
  }

  MidiaCache.init({
    title: DataTypes.STRING,
    id_telegram: DataTypes.BIGINT,
    repo_id: DataTypes.BIGINT,
    message_id: DataTypes.INTEGER,
    file_id: DataTypes.STRING,
    youtube_id: DataTypes.STRING,
    downloads: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'MidiaCache',
  });

  return MidiaCache;
};
