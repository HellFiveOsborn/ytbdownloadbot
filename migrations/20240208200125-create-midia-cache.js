'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('MidiaCaches', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      id_telegram: {
        type: Sequelize.BIGINT,
        comment: 'ID do usuário que solicitou o download do audio!'
      },
      repo_id: {
        type: Sequelize.BIGINT,
        comment: 'ID do canal que o arquivo foi enviado para cache!'
      },
      message_id: {
        type: Sequelize.INTEGER,
        unique: true,
        comment: 'ID da mensagem enviada para canal de cache!'
      },
      file_id: {
        type: Sequelize.STRING,
        unique: true,
        comment: 'ID do arquivo enviado para canal de cache!'
      },
      youtube_id: {
        type: Sequelize.STRING,
        unique: true,
        comment: 'ID da música youtube!'
      },
      title: {
        type: Sequelize.STRING,
        comment: 'Título da música',
        allowNull: true,
        defaultValue: 'N/A'
      },
      downloads: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: 'Total de downloads'
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

    await queryInterface.addIndex('MidiaCaches', ['id_telegram'], {
      name: 'id_telegram_mdc_idx'
    });
    await queryInterface.addIndex('MidiaCaches', ['file_id'], {
      unique: true,
      name: 'file_id_idx'
    });
    await queryInterface.addIndex('MidiaCaches', ['youtube_id'], {
      unique: true,
      name: 'youtube_id_idx'
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('MidiaCaches', 'id_telegram_mdc_idx');
    await queryInterface.removeIndex('MidiaCaches', 'file_id_idx');
    await queryInterface.removeIndex('MidiaCaches', 'youtube_id_idx');
    await queryInterface.dropTable('MidiaCaches');
  }
};