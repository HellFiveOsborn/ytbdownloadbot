require('dotenv').config({ path: '../../.env', encoding: 'utf-8', override: true });
const axios = require('axios');
const WebSocket = require('ws');
const FormData = require('form-data');
const { redisRemember, redisDestroy, resolve_path, Logger, env, formatFilename, sleep } = require('./functions');
const ffmpeg = require('./ffmpeg');
const path = require('path');
const fs = require('fs');
const randomString = (size, toUppercase = true) => Array.from({ length: size },
    () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 52)]).join('')[(toUppercase ? 'toUpperCase' : 'toLowerCase')]();

class YT5s {
    constructor(link) {
        this.link = link;
        this.job = null;
        this.onProgressCallback = null;
        this.onCompleteCallback = null;
        this.onErrorCallback = null;
        this.path = path.resolve(__dirname, '../..');
        this.filePath = '';
    }

    async getVideoData() {
        const form = new FormData();
        form.append('input', this.link);
        form.append('quality', 720);
        form.append('type', 'video');
        try {
            const response = await axios.post('https://youtube-extractor.com/extract_youtube_links.php', form, {
                headers: {
                    'accept': 'application/json, text/javascript, */*;',
                    'Content-type': 'multipart/form-data',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                },
            })
            return response.data;
        } catch (error) {
            console.log(error);
            this._handleError('Failed to fetch data', error);
            throw error;
        }
    }

    async getQualities() {
        try {
            let qualKeys = `YT5S_QUALITIES:${this.link}`;
            const data = await redisRemember(qualKeys, async () => {
                const response = await axios.post('https://yt5s.io/api/ajaxSearch', `q=${encodeURIComponent(this.link)}&vt=home`, {
                    headers: {
                        'accept': '*/*',
                        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                    },
                });
                return response.data;
            }, 160)
            if (data.hasOwnProperty('vid')) return data;
            const message = data.mess.length > 0 ? data.mess : 'Não foi possivel obter as qualidades!';
            redisDestroy(qualKeys);
            throw new Error(message);
        } catch (error) {
            this._handleError('Failed to fetch formats', error);
            throw error;
        }
    }

    async saveFile(downloadUrl, filePath) {
        try {
            this.job = { ...this.job, status: 'downloading', url: downloadUrl, progress: 0 };
            const writer = fs.createWriteStream(filePath);

            const response = await axios({
                url: downloadUrl,
                method: 'GET',
                responseType: 'stream',
            });

            const totalLength = typeof response.headers['content-length'] === 'string' ? parseInt(response.headers['content-length'], 10)
                : response.headers['content-length'][0];

            let downloadedLength = 0;
            let lastUpdate = Date.now();

            response.data.on('data', async (chunk) => {
                downloadedLength += chunk.length || 0;
                this.job.progress = Math.round((downloadedLength / totalLength) * 100);

                const now = Date.now();
                if ((now - lastUpdate) >= 1500) { // Update every 1.5 seconds
                    lastUpdate = now;
                    if (this.onProgressCallback) {
                        this.onProgressCallback(this.job.progress);
                    }
                }
            });

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    if (this.onCompleteCallback) {
                        this.onCompleteCallback({ file: filePath, size: writer.bytesWritten });
                    }
                    resolve(this);
                }).on('error', (error) => {
                    this._handleError('Failed to download file', error);
                    reject(error);
                });
            });
        } catch (error) {
            Logger.error('Error while saving the download', error)
        }
    }

    async getDownloadAudio() {
        const video_id = new RegExp(/^((?:https?:)?\/\/)?((?:www|m|music)\.)?((?:youtube\.com|youtu\.be))(\/(?:[\w\-]+\?v=|\w+\/|v\/)?)(?<video_id>[\w\-]+)(\S+)?$/)
            .exec(this.link)?.groups?.video_id;

        const form = new FormData();
        form.append('plataform', 'youtube');
        form.append('url', this.link);
        form.append('title', 'Audio Download');
        form.append('id', video_id)
        form.append('ext', 'mp3')
        form.append('note', 'mp3-128')
        form.append('format', '');
        try {
            const response = await axios.post('https://ssyoutube.video/mates/en/convert?id=' + video_id, form, {
                headers: {
                    'accept': 'application/json, text/javascript, */*;',
                    'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                },
            })
            if (response.data.status !== 'success' || !response.data.downloadUrlX) {
                throw new Error('Erro:', response.data);
                return;
            }
            return response.data.downloadUrlX;
        } catch (error) {
            //console.log(error);
            this._handleError('Failed to fetch data', error);
            throw error;
        }
    }

    async download(format, quality, filename) {
        try {
            let folder_download = path.join(resolve_path(process.env.OUTPUT_DIR), randomString(12));
            fs.mkdirSync(folder_download, { recursive: true }); // Create the folder if it doesn't exist
            this.filePath = path.join(folder_download, `source.${format}`);

            if (format == 'mp3') {
                const AudioUrl = await this.getDownloadAudio();
                return await this.saveFile(AudioUrl, this.filePath);
            }

            const qualities = await this.getQualities();
            const token = qualities.token;
            const timeExpire = qualities.timeExpires;
            const convertResponse = await axios.post('https://dt232.dlsnap04.xyz/api/json/convert',
                `v_id=${qualities.vid}&ftype=${format}&fquality=${quality}&fname=${encodeURIComponent(filename)}&token=${token}&timeExpire=${timeExpire}&client=yt5s.io`,
                {
                    headers: {
                        'accept': '*/*',
                        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                    },
                }
            );

            if (convertResponse.data.status === 'success' && convertResponse.data.result !== 'Bad token') {
                if (convertResponse.data.hasOwnProperty('jobId')) {
                    this.job = { id: convertResponse.data.jobId, status: 'pending', url: '', progress: 0 };
                    this._trackProgress();
                } else if (convertResponse.data.result.startsWith('http')) { // Direct download
                    this.job = { ...this.job, status: 'downloading', url: convertResponse.data.result, progress: 0 };
                    return await this.saveFile(this.job.url, this.filePath);
                }
            } else {
                throw new Error(convertResponse.data.result || 'Failed to start download');
            }
        } catch (error) {
            this._handleError('Failed to start download', error);
            throw error;
        }
        return this;
    }

    _trackProgress() {
        const ws = new WebSocket(`wss://dt232.dlsnap04.xyz/sub/${this.job.id}?fname=yt5s.io`);

        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.action == 'progress') {
                    this.job.progress = message.value;
                    if (this.onProgressCallback) {
                        this.onProgressCallback(message.value);
                    }
                } else if (message.action == 'success') {
                    this.job.status = 'completed';
                    this.job.url = message.url;
                    this.job.progress = 0;
                    if (this.onProgressCallback) {
                        this.onProgressCallback(this.job.progress);
                    }
                    await this.saveFile(this.job.url, this.filePath).then(() => {
                        console.log('Arquivo salvo');
                    })
                }
            } catch (error) {
                console.log(error);
                this._handleError('Error parsing WebSocket message', error);
            }
        });

        ws.on('error', (error) => {
            console.log(error);
            this._handleError('WebSocket error', error);
        });

        ws.on('close', (code, reason) => {
            console.log(`WebSocket closed with code ${code}. Reason: ${reason}`);
            if (this.job.status !== 'completed') {
                this._handleError('WebSocket connection closed unexpectedly', new Error(reason));
            }
        });
    }

    _handleError(message, error) {
        if (this.onErrorCallback) {
            this.onErrorCallback(message, error);
        }
    }

    getStatus() {
        if (this.job) {
            return { status: this.job.status, progress: this.job.progress, url: this.job.url };
        } else {
            throw new Error('No job started');
        }
    }

    onProgress(callback) {
        this.onProgressCallback = callback;
        return this;
    }

    onComplete(callback) {
        this.onCompleteCallback = callback;
        return this;
    }

    onError(callback) {
        this.onErrorCallback = callback;
        return this;
    }
}

module.exports = YT5s;