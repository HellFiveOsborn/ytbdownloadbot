const { exec, spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const fetch = require('node-fetch');
const sharp = require('sharp');
const { resolve_path, sleep } = require('./functions');

const util = require('util');

const download_path = process.env.download_path;

const disponiveis = {
  video: {
    qualidades: ['144p', '360p', '480p', '720p', '1080p'],
    formatos: ['mp4', 'mkv']
  },
  audio: {
    qualidades: ['128k', '192k', '320k'],
    formatos: ['mp3', 'm4a']
  },
};

/**
 * Class Base
 */
class Model {
  constructor() {
    this.url = '';
    this.path = path.resolve(__dirname, '../..');
    this.data = null;

    // Lista de processos
    this.ytdlpProcess = null;
    this.queue = new Map();
    this.onCompleteCallback = null;
  }

  /**
   * Define a URL da media!
   * 
   * @param {string} url 
   * @return instance
   */
  setUrl(url) {
    this.url = url;
    return this;
  }

  /**
   * Retorna dados da media do Youtube
   * 
   * @return {object|Error}
   */
  async getData() {
    if (!this.url) throw new Error('URL não definida.');

    return new Promise((resolve, reject) => {
      const process = spawn('yt-dlp', ['--dump-json', this.url]); // Use o URL fornecido como argumento

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          try {
            this.data = JSON.parse(stdout);
            resolve(this.data);
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error(`yt-dlp process exited with code ${code}. Error: ${stderr}`));
        }
      });
    });
  }

  /**
   * Retorna o tipo da media 
   * 
   * @return {object} Tipo Video ou Audio
   */
  async getTipo() {
    let response = (!this.data) ? await this.getData() : this.data;

    let data = {
      tipo: response.hasOwnProperty('track') ? 'music' : 'video',
      qualidades: this.getQualities(),
      informacoes: {
        title: response.title,
        thumbnail: response.thumbnail,
        description: response.description,
        channel: response.channel,
        language: response.language,
        categories: response.categories,
        duration: response.duration,
        duration_string: response.duration_string,
      }
    }

    if (data.tipo === 'music') {
      data.informacoes = {
        ...data.informacoes,
        album: response.album,
        artist: response.artist,
        track: response.track,
        release_date: response.release_date,
        release_year: response.release_year,
      };
      delete data.qualidades;
    }

    return data;
  }

  /**
   * Obtém as qualidades disponíveis para o vídeo.
   * 
   * @return {object} - Um objeto contendo as qualidades disponíveis para o vídeo.
   */
  getQualities() {
    if (!this.data) throw new Error('Não há dados');

    const { formats } = this.data;

    let video_base = null;  // Inicialize a qualidade máxima como nula

    formats.forEach((format) => {
      if (format.vcodec !== 'none' && format.acodec !== 'none') {
        // Verifique se a qualidade atual é maior do que a qualidade máxima
        if (disponiveis.video.qualidades.indexOf(format.format_note) > disponiveis.video.qualidades.indexOf(video_base?.format_note || '144p')) {
          video_base = format;
        }
      }
    });

    const qualidades = {};

    disponiveis.video.formatos.forEach((formato) => {
      qualidades[formato] = {
        qualidades: {},
        total: 0
      };

      disponiveis.video.qualidades.forEach((qualidade) => {
        if (qualidade === video_base.format_note || disponiveis.video.qualidades.indexOf(qualidade) < disponiveis.video.qualidades.indexOf(video_base.format_note)) {
          qualidades[formato].qualidades[qualidade] = {
            id: video_base.format_id,
            opcao: qualidade,
            vcodec: video_base.vcodec,
            acodec: video_base.acodec,
            formato_original: video_base.video_ext,
            recode: video_base.video_ext !== formato || disponiveis.video.qualidades.indexOf(qualidade) != disponiveis.video.qualidades.indexOf(video_base.format_note)
          };
          qualidades[formato].total = qualidades[formato].total + 1
        }
      });
    });

    disponiveis.audio.formatos.forEach((formato) => {
      qualidades[formato] = {
        qualidades: {},
        total: 0
      }

      disponiveis.audio.qualidades.forEach((qualidade) => {
        qualidades[formato].qualidades[qualidade] = {
          id: video_base.format_id,
          opcao: qualidade,
          vcodec: video_base.vcodec,
          acodec: video_base.acodec,
          formato_original: video_base.video_ext,
          recode: true // Precisa sim fazer recode, pois e um video, e queremos converter para audio
        };
        qualidades[formato].total = qualidades[formato].total + 1
      });
    })

    return qualidades;
  }

  /**
   * Retorna uma string em maiúscula ou minúscula com base no tamanho especificado.
   *
   * @param {integer} size - O tamanho da string desejada.
   * @param {boolean} [toUppercase=true] - Se true, a string será em maiúscula; caso contrário, em minúscula.
   *
   * @return {string} - A string aleatória gerada.
   */
  randomString(size, toUppercase = true) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const characterCount = characters.length;
    let randomName = '';

    for (let i = 0; i < size; i++) {
      const randomIndex = Math.floor(Math.random() * characterCount);
      const randomChar = characters[randomIndex];

      if (toUppercase) {
        randomName += randomChar.toUpperCase();
      } else {
        randomName += randomChar;
      }
    }

    return randomName;
  }

  /**
   * Retorna o nome do arquivo formatado, sem caracteres especiais.
   * 
   * @param {string} name 
   * @return {string}
   */
  fileNameReplace(name) {
    return name.replace(/[/\\?%*:|"<> ]/g, '-');
  }

  /**
   * Extraia o video ID
   * 
   * @param {string} url 
   * @returns {object} Objeto
   */
  splitURL(url) {
    const data = url.match(/(?:https?:\/\/)?(?:www\.)?youtu(?:\.be\/|be.com\/\S*(?:|v|watch|e|embed|shorts)(?:(?:(?=\/[-a-zA-Z0-9_]{11,}(?!\S))\/)|(?:\S*v=|v\/)))(?<video_id>[-a-zA-Z0-9_]{11,})/);

    if (data) {
      return {
        videoId: data[1],
        full_uri: data[0],
        input: data.input,
        index: data.index,
        groups: data.groups ?? [],
      };
    } else {
      return null; // Retorna null se a regex não encontrar uma correspondência
    }
  }

  /**
   * Efetua o download e conversão no formato.
   * 
   * @param {string|NULL} video_id ID do video
   * @param {string} formato_original Formato original do video.
   * @param {string} formato Formato (MP4/MKV/MP3...)
   * @param {string} qualidade Qualidade (360p/480p/720p/|128/192/360)
   * @param {string|NULL} id_qualidade ID da qualidade
   * @param {boolean} recode Recodificar o video.
   */
  download_convert(video_id = null, formato_original, formato, qualidade, id_qualidade = null, recode = false, isVip = false) {
    if (!qualidade || !formato) throw new Error('Você deve especificar o ID da qualidade e o formato para o download.');

    if (!video_id) {
      if (!this.url) {
        throw new Error('ID ou URL do video não definida.');
      }
    }

    // Verifica se o formato não está em "video" nem em "audio"
    if (!disponiveis.video.formatos.includes(formato) && !disponiveis.audio.formatos.includes(formato)) {
      throw new Error(`O formato ${formato} não está disponível para vídeo nem para áudio.`)
    }

    const random = this.randomString(12);
    const source = `https://www.youtube.com/watch?v=${video_id}` ?? this.url;
    const pasta = path.join(resolve_path(download_path), random);
    const nome_arquivo = `${pasta}/${random}.%(ext)s`;

    const argumentos = [
      '-q', '--progress', // Mostrar somente o progresso
    ];

    if (!isVip) {
      argumentos.push('-r', '250k') // Limita o download a 250kbps
    }

    argumentos.push('-o', nome_arquivo, source);

    if (id_qualidade) {
      argumentos.unshift('-f', id_qualidade);
    }

    this.ytdlpProcess = spawn('yt-dlp', argumentos);
    this.queue.set(`ytdlp_processo_${this.ytdlpProcess.pid}`, this.ytdlpProcess); // Salve o ID do processo

    this.ytdlpProcess.stderr.on('data', (data) => console.log(data.toString()));

    // Adicione um ouvinte para o evento 'close' do processo
    this.ytdlpProcess.on('close', (code) => {
      this.queue.delete(this.ytdlpProcess.pid); // Remova o processo do mapa após a conclusão

      if (code === 0) {
        if (this.onCompleteCallback) {
          this.onCompleteCallback({
            pasta,
            arquivo: nome_arquivo.replace('%(ext)s', formato_original),
            nome: random,
            recode
          });
        }
      } else {
        // Trate o erro se o processo YT-dlp terminar com código diferente de 0
        console.error(`YT-dlp process exited with code ${code}`);
      }
    });

    this.processo_id = this.ytdlpProcess.pid;

    return this;
  }

  /**
   * Baixa uma musica
   * 
   * @param {int} video_id 
   * @returns 
   */
  download_track(video_id = null, isVip = false) {
    if (!video_id) {
      if (!this.url) {
        throw new Error('ID ou URL do video não definida.');
      }
    }

    const random = this.randomString(12);
    const source = video_id ?? this.url;
    const pasta = path.join(resolve_path(download_path), random);
    const nome_arquivo = `${pasta}/${random}.mp3`;

    const thumbnail = path.join(pasta, `${random}.jpg`);

    const argumentos = [
      '-q', '--progress', // Mostrar somente o progresso
    ]

    if (!isVip) {
      argumentos.push('-r', '250k') // Limita o download a 250kbps
    }

    const resto = [
      '-x', '--audio-format',
      'mp3',
      '-o', nome_arquivo,
      source
    ];

    argumentos.push(...resto);

    this.ytdlpProcess = spawn('yt-dlp', argumentos);
    this.queue.set(`ytdlp_processo_${this.ytdlpProcess.pid}`, this.ytdlpProcess); // Salve o ID do processo

    this.getTipo()
      .then((resp) => {
        // Adicione um ouvinte para o evento 'close' do processo
        this.ytdlpProcess.on('close', async (code) => {
          this.queue.delete(this.ytdlpProcess.pid); // Remova o processo do mapa após a conclusão

          // Cria a capa da musica.
          const res = await fetch(resp.informacoes.thumbnail);
          const buffer = await res.buffer();
          const img = sharp(buffer, { failOnError: false });
          await img.resize(250, 250)
            .toFormat('jpeg')
            .toFile(thumbnail, (err, info) => {
              if (err) {
                console.error(err);
                return;
              }
            });

          if (code === 0) {
            if (this.onCompleteCallback) {
              this.onCompleteCallback({
                ...resp.informacoes,
                song_path: nome_arquivo,
                capa: thumbnail,
                path: pasta
              });
            }
          } else {
            // Trate o erro se o processo YT-dlp terminar com código diferente de 0
            console.error(`YT-dlp process exited with code ${code}`);
          }
        });

      });

    this.processo_id = this.ytdlpProcess.pid;

    return this;
  }

  /**
   * Monitora o progresso de um processo em segundo plano.
   *
   * @param {Function} callback - A função de retorno de chamada que recebe informações de progresso.
   * @returns {Model} - Retorna a instância atual para vinculação em cascata.
   */
  progress(callback) {
    if (this.ytdlpProcess !== null && !this.ytdlpProcess.killed) {
      this.ytdlpProcess.stdout.on('data', async (data) => {
        const output = data.toString('utf-8');

        // Verifique se a linha contém informações sobre o progresso
        if (output.includes('[download]')) {
          const match = output.match(/(\d+\.\d+(?:%|MiB|KiB\/s))/g);

          if (match.length) {
            if (!match[0] || !match[1] || !match[2]) return;

            const porcentagem = parseFloat(match[0]);
            const baixado = match[1];
            const velocidade = match[2];

            await sleep(1000);

            if (callback) {
              callback({ porcentagem, baixado, velocidade });
            } else {
              return { porcentagem, baixado, velocidade }
            }
          }
        }
      });

      // Quando a conversão estiver concluída ou o processo for encerrado
      this.ytdlpProcess.on('close', () => {
        this.ytdlpProcess.stderr.removeAllListeners('data'); // Remove todos os ouvintes de 'data'
      });
    }

    return this;
  }

  /**
   * Método para definir uma função de retorno de chamada quando o download estiver completo.
   *
   * @param {function} callback - A função de retorno de chamada a ser executada quando o download estiver completo.
   * @return {Model} - Retorna a instância atual para vinculação em cascata.
   */
  onComplete(callback) {
    this.onCompleteCallback = callback;
    return this;
  }
}

/**
 * Class para tratamento de Audio
 */
class Audio extends Model {
  constructor() {
    super();
  }

  downloadMusic(video_id, isVip = false) {
    return super.download_track(video_id, isVip);
  }

  progress(callback) {
    return super.progress(callback);
  }

  onComplete(callback) {
    return super.onComplete(callback);
  }
}

/**
 * Class para tratamento de Video
 * @extends {Model}
 */
class Video extends Model {
  constructor() {
    super();
  }

  download_convert(video_id = null, formato_original, formato, qualidade, id_qualidade, recode, isVip = false) {
    return super.download_convert(video_id, formato_original, formato, qualidade, id_qualidade, recode, isVip);
  }

  progress(callback) {
    return super.progress(callback);
  }

  onComplete(callback) {
    return super.onComplete(callback);
  }
}

module.exports = { Audio, Video };
