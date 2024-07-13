'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.hasMany(models.MidiaCache, { foreignKey: 'id_telegram', as: 'midiacache' });
    }

    /**
     * Obtém um usuário pelo id ou id_telegram ou cria um novo usuário com os parâmetros fornecidos.
     * 
     * @param {Object} params Objeto contendo os parâmetros da função.
     * @param {number|null} [params.id=null] ID do usuário. Opcional se id_telegram é fornecido.
     * @param {BigInt|null} [params.id_telegram=null] ID do Telegram do usuário. Opcional se id é fornecido.
     * @param {string} [params.lang='en'] Idioma preferencial do usuário. Padrão é 'en'.
     * @param {boolean} [params.status=true] Status do usuário, onde `true` indica que o usuário não está banido.
     * @returns {Promise<User>} Uma promessa que resolve com o usuário obtido ou criado.
     */
    static async getUser({ id = null, id_telegram = null, lang = 'en', status = true }) {
      if (id) {
        const [user] = await User.findOrCreate({ where: { id }, defaults: { id_telegram, lang, status } });
        return user;
      } else if (id_telegram) {
        const [user] = await User.findOrCreate({ where: { id_telegram }, defaults: { lang, status } });
        return user;
      }
      throw new Error("É necessário fornecer id ou id_telegram");
    }

    /**
     * Verifica se um usuário está banido com base no seu ID do Telegram.
     * 
     * Esta função busca um usuário específico usando o ID do Telegram fornecido. Ela retorna `true`
     * se o usuário estiver banido (ou seja, se o status do usuário for `false`), e `false` caso contrário.
     * 
     * @param {number} id_telegram O ID do Telegram do usuário a ser verificado.
     * @returns {Promise<boolean>} Uma promessa que resolve para `true` se o usuário estiver banido,
     * e `false` se não estiver banido. A função é assíncrona e retorna uma promessa devido à natureza
     * da operação de busca no banco de dados.
     * 
     * @example
     * // Verifica se o usuário com ID do Telegram 123456789 está banido
     * isBanned(123456789).then(isBanned => {
     *   if (isBanned) {
     *     console.log('O usuário está banido.');
     *   } else {
     *     console.log('O usuário não está banido.');
     *   }
     * });
     */
    static async isBanned(id_telegram) {
      const user = await User.getUser({ id_telegram });
      return user.status === false;
    }

    /**
     * Obtém o idioma preferencial de um usuário com base no seu ID do Telegram.
     * 
     * @param {number} id_telegram O ID do Telegram do usuário a ser verificado.
     * @returns {Promise<User.lang>} Uma promessa que retorna o idioma do usuário.
     */
    static async getLang(id_telegram) {
      const user = await this.findOne({ where: { id_telegram } });
      return user?.lang || null;
    }

    static async setLang(id_telegram, lang) {
      const user = await this.findOne({ where: { id_telegram } });
      user && await user.update({ lang });

      return lang;
    }
  }
  User.init({
    id_telegram: DataTypes.BIGINT,
    lang: DataTypes.STRING,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'User',
  });
  return User;
};
