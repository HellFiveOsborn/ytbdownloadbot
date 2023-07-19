const { exec, spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const fetch = require('node-fetch');
const sharp = require('sharp');

class Model {
  constructor() {}

  /**
   * Retorna uma string em maiuscula com base no comprimento.
   * 
   * @return string
   */
  randomString(size) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomName = '';

    for (let i = 0; i < size; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      randomName += characters[randomIndex];
    }

    return randomName;
  };
}

class Audio extends Model {
  constructor() {
    super();

    this.url = '';
    this.path = path.resolve(__dirname, '../..');
  }

  setUrl(url) {
    this.url = url;
    return this;
  }

  async getInfo() {
    return new Promise((resolve, reject) => {
      const process = spawn('yt-dlp', ['--dump-json', this.url]);

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
            const info = JSON.parse(stdout);
            const infoFormatted = {
              title: info.title,
              thumbnail: info.thumbnail,
              duration: info.duration,
              album: info.album,
              artist: info.artist,
              track: info.track,
              release_date: info.release_date,
              release_year: info.release_year,
            };
            resolve(infoFormatted);
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error(`yt-dlp process exited with code ${code}. Error: ${stderr}`));
        }
      });
    });
  }

  async download() {
    const folder = path.join(this.path, process.env.download_path, this.randomString(8));

    try {
      let info = await this.getInfo();
      const fileName = info.track.replace(/[/\\?%*:|"<> ]/g, '-');
      const song = path.join(folder, `${fileName}.mp3`);
      const thumbnail = path.join(folder, `${fileName}.jpg`);

      // Cria a pasta com as permissões 0o755 (rwxr-xr-x)
      fs.mkdirSync(folder, { recursive: true, mode: 0o755 });

      // Cria a capa da musica.
      const res = await fetch(info.thumbnail);
      const buffer = await res.buffer();
      const img = sharp(buffer, { failOnError: false });
      await img.resize(250,250)
               .toFormat('jpeg')
               .toFile(thumbnail, (err, info) => {
                  if (err) {
                    console.error(err);
                    return;
                  }
               });

      // Baixa o áudio usando o yt-dlp
      await new Promise((resolve, reject) => {
        const process = spawnSync(
          'yt-dlp',
          ['-x', '--audio-format', 'mp3', '-o', song, this.url],
          { shell: true }
        );

        if (process.status === 0) {
          resolve();
        } else {
          reject(new Error(`yt-dlp process exited with code ${process.status}.`));
        }
      });

      info = {
        ...info,
        song_path: song,
        thumbnail: thumbnail,
        path: folder
      };

      return info;
    } catch (error) {
      fs.rm(folder, { recursive: true }, (err) => {
        if (err) {
          console.error(err.message);
          return;
        }

        console.info(`\nPASTA DELETADA\n`);
      });

      console.error(`\n=============================\n`);
      console.error(error)
      console.error(`\n=============================\n`);

      throw new Error('Failed to download audio: ', error);
    }
  }

}

module.exports = { Audio };