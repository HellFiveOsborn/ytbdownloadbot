'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Users', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      id_telegram: {
        type: Sequelize.BIGINT,
        unique: true
      },
      lang: {
        type: Sequelize.STRING,
        defaultValue: 'en' // Define 'en' como valor padrão
      },
      status: {
        type: Sequelize.BOOLEAN,
        defaultValue: true // Define true como valor padrão
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Cria um índice para 'id_telegram'
    await queryInterface.addIndex('Users', ['id_telegram'], {
      unique: true,
      name: 'id_telegram_idx'
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('Users', 'id_telegram_idx');
    await queryInterface.dropTable('Users');
  }
};