require('dotenv').config({ path: '../../.env', encoding: 'utf-8', override: true });

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const sharp = require('sharp');
const { resolve_path, Logger, env, formatFilename } = require('./functions');

const ffmpeg = require('./ffmpeg');

const specialRegex = {
  youtube: /(?:https?:\/\/)?(?:www\.)?youtu(?:\.be\/|be.com\/\S*(?:|v|watch|e|embed|shorts)(?:(?:(?=\/[-a-zA-Z0-9_]{11,}(?!\S))\/)|(?:\S*v=|v\/)))(?<video_id>[-a-zA-Z0-9_]{11,})/,
  callback_download: /\s(?<video_id>[^\s]+)\s(?<format_id>[^\s]+)\s?(?<audio_id>[^\s]+)?/
}

const supported_formats = {
  video: {
    qualities: [
      '144p', '180p', '256p', '298p', '300p', '360p', '426p', '446p',
      '450p', '480p', '540p', '594p', '600p', '640p', '720p', '854p',
      '900p', '1080p', '1920p'
    ],
    formats: ['mp4']
  },
  audio: {
    qualities: ['128k', '192k', '320k'],
    formats: ['mp3', 'm4a']
  },
};

const bandwidth = {
  noVip: env('NO_VIP_MAX_BANDWIDTH'),
  max: env('MAX_BANDWIDTH'),
}

const randomString = (size, toUppercase = true) => Array.from({ length: size },
  () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 52)]).join('')[(toUppercase ? 'toUpperCase' : 'toLowerCase')]();

const splitURL = url => {
  const match = url.match(specialRegex.youtube);
  return match ? {
    videoId: match.groups.video_id,
    fullUri: match[0],
    input: match.input,
    index: match.index,
    groups: match.groups ?? {}
  } : null;
};

const YT5s = require('./yt5s');

/**
 * Class Base
 */
class Model {
  constructor() {
    this.url = '';
    this.path = path.resolve(__dirname, '../..');
    this.data = null;

    this.yt_dlp = null;
    this.ffmpeg = null;

    this.queue = new Map(); // Lista de processos

    this.onCompleteCallback = this.onErrorCallback = null;

    this.isVip = false;
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

  durationToSeconds(duration) {
    const parts = duration.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  convertViewCount(viewCount) {
    let number = viewCount.replace(/,/g, '.'); // Substitui vírgulas por pontos para facilitar a conversão
    let multiplier = 1;

    if (number.includes('B')) {
      multiplier = 1e9;
      number = number.replace('B', '');
    } else if (number.includes('Mi')) {
      multiplier = 1e6;
      number = number.replace('Mi', '');
    } else if (number.includes('Mil')) {
      multiplier = 1e3;
      number = number.replace('Mil', '');
    }

    return Math.round(parseFloat(number) * multiplier);
  }

  parseSize(size) {
    if (!size) {
      return null;  // Ou qualquer valor padrão que faça sentido no seu contexto
    }

    let sizeInMB;
    if (size.includes('MB')) {
      sizeInMB = parseFloat(size.replace(' MB', ''));
    } else if (size.includes('GB')) {
      sizeInMB = parseFloat(size.replace(' GB', '')) * 1024;
    } else if (size.includes('KB')) {
      sizeInMB = parseFloat(size.replace(' KB', '')) / 1024;
    } else {
      throw new Error('Unrecognized size format');
    }
    return Math.round(sizeInMB * 1024 * 1024);
  }

  async ytExtractTemp(url) {
    const yt5Class = new YT5s(url);
    const ytdata = await yt5Class.getVideoData();
    const links = await yt5Class.getQualities();
    if (!links.hasOwnProperty('token') || !links.links) {
      throw new Error(links.mess || 'Unknow error on getting video qualities!');
      return;
    }
    this.data = {
      type: ytdata[0].uploader.includes('Topic') ? 'music' : 'video',
      title: ytdata[0].title,
      upload_date: ytdata[0].uploaddate.split('.').reverse().join(''),
      thumbnail: ytdata[0].thumbnail,
      description: 'No description...',
      channel: ytdata[0].uploader.replace(' - Topic', ''),
      channel_url: 'https://yt.be/HellFiveOsborn',
      channel_is_verified: false,
      language: 'en',
      categories: [],
      duration: this.durationToSeconds(ytdata[0].duration),
      duration_string: ytdata[0].duration.startsWith('00:') ? ytdata[0].duration.slice(3) : ytdata[0].duration,
      view_count: this.convertViewCount(ytdata[0].viewcount),
      tags: [],
      channel_follower_count: 0,
      live_status: false,
      track: ytdata[0].uploader.includes('Topic') ? ytdata[0].title : false,
      album: '',
      artist: ytdata[0].uploader.replace(' - Topic', ''),
      release_date: '',
      release_year: 0,
      formats: Object.keys(links).flatMap(formatType => {
        return Object.keys(links[formatType] || {}).flatMap(key => {
          const formatKeys = links[formatType][key] || {};
          return Object.values(formatKeys).map(format => {
            const height = format.k ? parseInt(format.k.replace('p', ''), 10) : null;
            return {
              "asr": null,
              "filesize": this.parseSize(format.size),
              "format_id": `${key}@${format.k}`,
              "format_note": format.q,
              "source_preference": null,
              "fps": 30,
              "audio_channels": null,
              "height": height,
              "quality": null,
              "has_drm": false,
              "tbr": null,
              "filesize_approx": null,
              "url": null,
              "width": null,
              "preference": null,
              "ext": format.f,
              "vcodec": format.f == 'mp3' || format.f == 'ogg' ? "none" : "true",
              "acodec": "true",
              "dynamic_range": null,
              "container": format.f ? `${format.f}_dash` : null,
              "resolution": format.f == 'mp3' ? "audio only" : format.k || null,
              "aspect_ratio": null,
              "video_ext": format.f == 'mp3' || format.f == 'ogg' ? "none" : format.f,
              "audio_ext": format.f == 'mp3' || format.f == 'ogg' ? format.f : "none",
              "abr": parseInt(format.f == 'mp3' || format.f == 'ogg' ? format.k : 0),
              "vbr": 0,
              "format": `${key} - ${format.k} (${format.q})`
            };
          }).filter(item =>
            item.filesize !== null &&
            item.format_note !== undefined &&
            item.height !== null &&
            item.ext !== undefined &&
            item.container !== null &&
            item.resolution !== null &&
            item.video_ext !== undefined
          );
        });
      })
    }
  }

  /**
   * Retorna dados da media do Youtube
   * 
   * @return {object|Error}
   */
  async getFullData(video_id = null) {
    if (!this.url && !video_id) throw new Error('URL/ID não definido.');

    return new Promise((resolve, reject) => {
      const process = spawn('yt-dlp', ['-J', this.url || video_id]);

      let stdout, stderr = '';

      process.stdout.on('data', (data) => stdout += data.toString());
      process.stderr.on('data', (data) => stderr += data.toString());

      process.on('close', async (code) => {
        if (!stderr.includes('ERROR:')) {
          code === 0 ? (() => {
            try {
              this.data = JSON.parse(stdout);
              resolve(this.data);
            } catch (error) {
              reject(new Error(`Falha ao analisar o JSON do stdout: ${error.message}`));
            }
          })() : reject(new Error(`yt-dlp process exited with code ${code}.`, stderr));
        } else {
          try {
            await this.ytExtractTemp(video_id ? `https://www.youtube.com/watch?v=${video_id}` : this.url);
            resolve(this.data);
          } catch (error) {
            reject(new Error(error));
          }
        }
      });
    });
  }

  /**
   * Retorna dados simplificados do Youtube
   * 
   * @returns {{
  *   type: string,
  *   data: {
  *     title: string,
  *     upload_date: string,
  *     thumbnail: string,
  *     description: string,
  *     channel: string,
  *     channel_url: string,
  *     channel_is_verified: boolean,
  *     language: string,
  *     categories: string[],
  *     duration: number,
  *     duration_string: string,
  *     view_count: number,
  *     tags: string[],
  *     channel_follower_count: number,
  *     album?: string,
  *     artist?: string,
  *     track?: string,
  *     release_date?: string,
  *     release_year?: number
  *  }
  * }} Objeto contendo informações de vídeo ou música.
  */
  async getData() {
    const response = this.data || await this.getFullData();
    const { title, thumbnail, description, channel, channel_url, channel_is_verified, language, categories, duration, duration_string, track, album, artist, release_date, release_year, view_count, tags, upload_date, channel_follower_count, live_status } = response;

    let data = {
      type: track ? 'music' : 'video',
      data: {
        title,
        upload_date,
        thumbnail,
        description,
        channel,
        channel_url,
        channel_is_verified: channel_is_verified || false,
        language,
        categories,
        duration,
        duration_string,
        view_count,
        tags,
        channel_follower_count,
        live: (live_status === 'is_live' ? true : false),
        ...(
          track && {
            album,
            artist,
            track,
            release_date,
            release_year,
          }
        ),
      },
    };

    // Adiciona 'qualidades' somente se for um vídeo
    if (data.type === 'video') {
      data.qualities = this.getQualities();
    }

    // fs.writeFileSync('test.json', JSON.stringify({
    //   cache: data,
    //   formatos: this.data.formats
    // }, null, 2));

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

    const formatSize = (size) => {
      if (size === undefined) return 'Desconhecido';
      const i = size === 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
      return `${(size / Math.pow(1024, i)).toFixed(2) * 1} ${['B', 'KB', 'MB', 'GB', 'TB'][i]}`;
    }

    // Filtra e ordena os formatos de vídeo webm sem áudio
    let videoFormats = formats
      .filter(f => f.ext === 'webm' && f.acodec === 'none' && supported_formats.video.qualities.includes(`${f.height}p`))
      .reduce((acc, current) => {
        const { height } = current;
        if (height && !acc.some(item => item.height === height)) {
          acc.push(current);
        }
        return acc;
      }, [])
      .sort((a, b) => b.height - a.height) // Ordena pela maior qualidade
      .map(({ format_id, height, filesize }, index) => ({
        formatId: format_id,
        quality: `${height}p`,
        fileSize: formatSize(filesize),
        best: index === 0 // Marca a melhor qualidade
      }));

    // Se não encontrar vídeos webm, busca o melhor formato mp4 com áudio
    if (!videoFormats.length) {
      videoFormats = formats
        .filter(f => f.ext === 'mp4' && f.acodec !== 'none' && supported_formats.video.qualities.includes(`${f.height}p`))
        .reduce((acc, current) => {
          const { height } = current;
          if (height && !acc.some(item => item.height === height)) {
            acc.push(current);
          }
          return acc;
        }, [])
        .sort((a, b) => b.height - a.height)
        .map(({ format_id, height, filesize, filesize_approx }, index) => ({
          formatId: format_id,
          quality: `${height}p`,
          fileSize: formatSize(filesize || filesize_approx),
          best: index === 0
        }));
    }

    if (!videoFormats.length) {
      console.log(`\nNão foram encontradas Qualidades do video ${this.data.videoId}`);
    }

    // Encontra e formata o áudio de melhor qualidade
    let audioFormat = formats
      .filter(f => supported_formats.audio.formats.includes(f.ext) && f.acodec !== 'none' && f.vcodec === 'none')
      .map(f => {
        const approximateBitrate = supported_formats.audio.qualities.reduce((closest, quality) => {
          const qualityBitrate = parseInt(quality);
          return Math.abs(qualityBitrate - f.abr) < Math.abs(closest - f.abr) ? qualityBitrate : closest;
        }, Infinity);
        return { ...f, abr: approximateBitrate + 'k' };
      })
      .filter(f => supported_formats.audio.qualities.includes(f.abr))
      .reduce((best, current) => (best.bitrate > current.bitrate ? best : current), { bitrate: 0 });

    return {
      videoFormats,
      audioFormat: audioFormat ? {
        formatId: audioFormat.format_id,
        quality: `${audioFormat.abr}`,
        fileSize: formatSize(audioFormat.filesize),
        best: true
      } : null
    };
  }

  /**
   * Efetua o download e conversão no formato.
   * 
   * @param {string|NULL} video_id ID do video
   * @param {Array} formats Formatos de qualidade
   * @param {string|NULL} id_qualidade ID da qualidade
   */
  downloadVideo(videoId = null, formats = [], isVip = false) {
    if (!videoId && !this.url) {
      throw new Error('ID ou URL do video não definida.');
    }

    let source = videoId ? `https://www.youtube.com/watch?v=${videoId}` : this.url;
    let folder_download = path.join(resolve_path(process.env.OUTPUT_DIR), randomString(12));
    let file_name = '%(title)s.%(ext)s';
    this.isVip = isVip;

    let args = ['-v', '-q', '--progress', '-o', path.join(folder_download, file_name)];
    const bandwidthValue = !isVip ? bandwidth.noVip : bandwidth.max;
    args.push('-r', bandwidthValue);

    args = (formats.filter(i => i != null).length > 1) ?
      ['-f', formats.join('+'), ...args] :
      ['-f', ...formats, ...args]

    args.push(source);

    this.yt_dlp = spawn('yt-dlp', ['--cookies', path.join(this.path, 'conexaossh.txt'), ...args.filter(arg => arg != null)]);
    this.queue.set(`YTDLP:${this.yt_dlp.pid}`, this.yt_dlp);

    let error = '';
    this.yt_dlp.stderr.on('data', (data) => error += data.toString());

    this.yt_dlp.on('close', (code) => {
      this.queue.delete(`YTDLP:${this.yt_dlp.pid}`); // Remova o processo do mapa após a conclusão.

      if (code === 0) {
        fs.readdir(folder_download, async (err, files) => {
          if (err) {
            Logger.save({ message: 'Erro ao listar arquivos do diretório de download', error: err })
            return;
          }
          let downloadedFile = files.find(file => path.extname(file) !== '');

          if (downloadedFile) {
            let fullPath = path.join(folder_download, downloadedFile);
            const ffmpegClass = this.convert(fullPath);

            ffmpegClass.getMediaType((data) => {
              ffmpegClass.isVip = this.isVip;
              ffmpegClass.start();
              ffmpegClass.progress((data) => this.yt_dlp.emit('converting', data));
              ffmpegClass.onComplete((data) => this.onCompleteCallback(data));
              ffmpegClass.onError((data) => this.onErrorCallback(data));
            });
          }
        });
      } else {
        this.onErrorCallback({
          error: true,
          message: `Erro ao baixar o video: Exit code ${code}`,
          processId: this.yt_dlp.pid,
          context: error
        });
      }
    });

    this.processId = this.yt_dlp.pid;

    return this;
  }

  convert(source) {
    this.ffmpeg = new ffmpeg(source);

    return this.ffmpeg;
  }

  /**
   * Baixa uma musica
   * 
   * @param {int} video_id 
   * @returns 
   */
  async downloadMusic(videoId = null, isVip = false) {
    if (!videoId && !this.url) {
      throw new Error('ID ou URL do video não definida.');
    }

    const fetchMusic = await this.getData();

    let source = videoId ? `https://music.youtube.com/watch?v=${videoId}` : this.url;
    let folder_download = path.join(resolve_path(process.env.OUTPUT_DIR), randomString(12));
    let file_name = `${formatFilename(fetchMusic?.data?.track)}.mp3`;
    let thumbnail = path.join(folder_download, `capa.jpg`);

    const args = ['-q', '--progress', '-x', '--audio-format', 'mp3', '-o', path.join(folder_download, file_name)];

    if (!isVip) {
      args.push('-r', bandwidth.noVip)
    } else {
      args.push('-r', bandwidth.max);
    }

    args.push(source);

    this.yt_dlp = spawn('yt-dlp', ['--cookies', path.join(this.path, 'conexaossh.txt'), ...args.filter(arg => arg != null)]);
    this.queue.set(`YTDLP:${this.yt_dlp.pid}`, this.yt_dlp);

    let error = '';
    this.yt_dlp.stderr.on('data', (data) => error += data.toString());

    this.yt_dlp.on('close', async (code) => {
      this.queue.delete(this.yt_dlp.pid); // Remova o processo do mapa após a conclusão

      // Cria a capa da musica.
      const res = await fetch(fetchMusic.data.thumbnail);
      const buffer = await res.buffer();
      const img = sharp(buffer, { failOnError: false });
      await img.resize(320, 320)
        .toFormat('jpeg', { quality: 70 })
        .toFile(thumbnail, (err, info) => {
          if (err) {
            Logger.error({ message: 'Erro ao salvar a capa da musica', error: err })
            return;
          }
        });

      if (code === 0) {
        fs.readdir(folder_download, async (err, files) => {
          if (err) {
            Logger.save({ message: 'Erro ao listar arquivos do diretório de download', error: err })
            return;
          }
          let downloadedFile = files.find(file => path.extname(file) !== '');
          if (downloadedFile) {
            let fullPath = path.join(folder_download, downloadedFile);

            if (thumbnail) {
              const tempPath = path.join(folder_download, `temp_${downloadedFile}`);
              const ffmpeg = await spawn('ffmpeg', ['-i', fullPath, '-i', thumbnail, '-map', '0:0', '-map', '1:0', '-c', 'copy', '-id3v2_version', '3', tempPath]);

              ffmpeg.on('close', (code) => {
                code === 0 ?
                  fs.rename(tempPath, fullPath, (err) => {
                    err ? Logger.save({ message: 'Erro ao substituir arquivo', error: err }, 'error') : '';
                  }) : Logger.save(`FFmpeg falhou com código ${code}`, 'error')
              });
            }

            this.onCompleteCallback({
              file_name,
              source: fullPath,
              thumbnail,
              folder_download,
              size: fs.statSync(fullPath).size,
              createdAt: fs.statSync(fullPath).mtime,
              extra: fetchMusic.data
            });
          }
        })
      } else {
        this.onErrorCallback({
          error: true,
          message: `Erro ao baixar o musica: Exit code ${code}`,
          processId: this.yt_dlp.pid,
          context: error
        });
      }
    });

    this.processId = this.yt_dlp.pid;

    return this;
  }

  /**
   * Monitora o progresso de um processo em segundo plano.
   *
   * @param {Function} callback - A função de retorno de chamada que recebe informações de progresso.
   * @returns {Model} - Retorna a instância atual para vinculação em cascata.
   */
  progress(callback) {
    if (this.yt_dlp !== null && !this.yt_dlp.killed) {
      this.yt_dlp.stdout.on('data', async (data) => {
        const output = data.toString('utf-8');

        // Verifique se a linha contém informações sobre o progresso
        if (output.includes('[download]')) {
          const match = output.match(/(\d+\.\d+(?:%|MiB|KiB\/s))/g);

          if (match.length) {
            if (!match[0] || !match[1] || !match[2]) return;

            const porcentagem = parseFloat(match[0]);
            const baixado = match[1];
            const velocidade = match[2];

            if (callback) {
              callback({ porcentagem, baixado, velocidade, converting: false });
            } else {
              return { porcentagem, baixado, velocidade, converting: false }
            }
          }
        }
      });

      // Quando a conversão estiver concluída ou o processo for encerrado
      this.yt_dlp.on('close', () => {
        this.yt_dlp.stderr.removeAllListeners('data'); // Remove todos os ouvintes de 'data'
      });
    }

    this.yt_dlp.on('converting', async ({ porcentagem, baixado, velocidade, converting }) => {
      if (callback) {
        callback({ porcentagem, baixado, velocidade, converting: true });
      } else {
        return { porcentagem, baixado, velocidade, converting: true }
      }
    });
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

  onError(callback) {
    this.onErrorCallback = callback;
    return this;
  }
}

/**
 * Class para tratamento de Audio
* @extends {Model}
 */
class YoutubeAudio extends Model {
  constructor(video_id = null) {
    super();

    if (video_id) {
      super.setUrl(`https://music.youtube.com/watch?v=${video_id}`);
    }
  }

  getData() {
    return super.getData();
  }

  async downloadMusic(video_id, isVip = false) {
    const download = super.downloadMusic(video_id, isVip);

    return download;
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
class YoutubeVideo extends Model {
  constructor(video_id = null) {
    super();

    if (video_id) {
      super.setUrl(`https://www.youtube.com/watch?v=${video_id}`);
    }
  }

  getData() {
    return super.getData();
  }

  async downloadVideo(videoId, formatId, audioId, isVip = false) {
    const download = super.downloadVideo(videoId, [formatId, audioId], isVip);

    return download;
  }

  progress(callback) {
    return super.progress(callback);
  }

  onComplete(callback) {
    return super.onComplete(callback);
  }
}

module.exports = { YoutubeAudio, YoutubeVideo };
