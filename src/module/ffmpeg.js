const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { sleep } = require('./functions');

/**
 * Conversor FFMPEG
 */
class ffmpegClass {
    constructor(input) {
        this.input = input;
        this.totalFrames = 0;
        this.mediaData = {}; // video ou audio
        this.ffmpeg = null;
        this.processes = new Map(); // Armazena os processos em segundo plano
        this.progressValue = 0;
        this.onCompleteCallback = this.onErrorCallback = null;
    }

    frames(callback) {
        const ffmpegProcess = spawn('ffmpeg', ['-i', this.input, '-vcodec', 'copy', '-f', 'null', '-']);

        ffmpegProcess.stderr.on('data', data => {
            const match = data.toString().match(/frame=\s*(\d+)/);
            if (match) {
                this.totalFrames = parseInt(match[1], 10);
            }
        });

        ffmpegProcess.on('close', code => {
            if (code && callback) {
                callback(new Error(`FFmpeg exited with code ${code}`))
            }
        });
        ffmpegProcess.on('error', err => {
            if (err && callback) {
                callback(err)
            }
        });
    }

    getMediaType(callback) {
        const ffprobe = spawn('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', this.input]);

        let rawData = '';

        ffprobe.stdout.on('data', (chunk) => rawData += chunk);

        ffprobe.on('close', (code) => {
            if (code !== 0) {
                return callback(new Error(`FFprobe exited with code ${code}`));
            }

            const parsedData = JSON.parse(rawData);
            const hasVideo = parsedData.streams.some(stream => stream.codec_type === 'video');
            const videoStream = hasVideo ? parsedData.streams.find(stream => stream.codec_type === 'video') : {};
            const output = {
                type: hasVideo ? 'video' : 'audio',
                filename: parsedData.format.filename,
                duration: parsedData.format.duration,
                size: parsedData.format.size,
                bit_rate: parsedData.format.bit_rate,
                streams: hasVideo ? {
                    codec: videoStream.codec_type,
                    width: videoStream.width,
                    height: videoStream.height,
                    aspect: videoStream.display_aspect_ratio,
                    bit_rate: videoStream.bit_rate
                } : {}
            };

            this.mediaData = output;

            if (callback) {
                return callback(output);
            }
        });
    }

    convert() {
        this.frames();

        const args = ['-i', this.input, '-y'];
        const audioBitrate = this.mediaData?.bit_rate ? `${Math.max(parseInt(this.mediaData.bit_rate, 10) / 1000, 128)}k` : '128k';

        this.mediaData?.type === 'video' ?
            args.push('-vf', `scale=${this.mediaData.streams.width}:${this.mediaData.streams.height}`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '28', '-c:a', 'aac', '-b:a', audioBitrate) :
            args.push('-c:a', 'libmp3lame', '-b:a', audioBitrate, '-q:a', '2');

        const outputExtension = this.mediaData?.type === 'audio' ? '.mp3' : '.mp4';
        const output = `${path.dirname(this.input)}/${path.basename(this.input, path.extname(this.input))}${outputExtension}`;
        args.push(output);

        this.ffmpeg = spawn('ffmpeg', args);
        this.processes.set(`FFMPEG:${this.ffmpeg.pid}`, this.ffmpeg);

        let error = '';
        this.ffmpeg.stderr.on('data', (data) => error += data.toString());

        let callbackObj;

        this.ffmpeg.on('close', (code) => {
            this.processes.delete(`FFMPEG:${this.ffmpeg.pid}`);
            code !== 0 ? this.onErrorCallback({ error: true, message: `Erro ao converter o ${this.mediaData?.type}: Exit code ${code}`, processId: this.ffmpeg.pid, context: error }) :
                callbackObj = {
                    file_name: path.basename(output),
                    source: output,
                    folder_download: path.dirname(output),
                    size: fs.statSync(output).size,
                    createdAt: fs.statSync(output).mtime,
                },
                callbackObj = this.mediaData?.type === 'video' ? { ...callbackObj, width: this.mediaData.streams.width, height: this.mediaData.streams.height, } : callbackObj,
                this.onCompleteCallback(callbackObj);
            fs.unlinkSync(this.input); // Deleta o arquivo original após a conversão
        });

        return this;
    }

    start() {
        this.convert() // Inicializa a conversão
        this.processo_id = this.ffmpeg.pid;
        return this;
    }

    progress(callback) {
        if (this.ffmpeg !== null && !this.ffmpeg.killed) {
            this.ffmpeg.stderr.on('data', async (data) => {
                const output = data.toString('utf-8');

                if (output.includes('frame=')) {
                    const frameMatch = output.match(/frame=\s*(?<frames>[0-9]+).*size=\s*(?<size>[0-9]\w+).*bitrate=\s*(?<bitrate>[0-9.]+kbits).*speed=\s*(?<speed>[0-9.]+x)/);

                    if (frameMatch && frameMatch[1]) {
                        const currentFrame = parseInt(frameMatch.groups.frames);
                        const porcentagem = parseFloat(((currentFrame / this.totalFrames) * 100).toFixed(2));
                        const baixado = frameMatch.groups.size;
                        const velocidade = frameMatch.groups.speed;

                        this.progressValue = porcentagem;

                        if (callback) {
                            callback({ porcentagem, baixado, velocidade, converting: true });
                        } else {
                            return { porcentagem, baixado, velocidade, converting: true };
                        }
                    }
                }
            });

            // Quando a conversão estiver concluída ou o processo for encerrado
            this.ffmpeg.on('close', () => {
                this.ffmpeg.stderr.removeAllListeners('data'); // Remove todos os ouvintes de 'data'
            });
        }
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

    get(id) {
        // Retorna um objeto que permite encadear métodos progress() e onComplete() para o processo específico
        const processo = this.processes.get(`FFMPEG:${id}`);

        return {
            progress: (progressCallback) => {
                // Verifica o progresso do processo
                if (processo !== undefined && !processo.killed) {
                    processo.stderr.on('data', (data) => {
                        const output = data.toString();
                        const frameMatch = output.match(/frame=\s(?<frames>\d+)/);

                        if (frameMatch && frameMatch.groups.frames) {
                            const currentFrame = parseInt(frameMatch.groups.frames);
                            const progressPercentage = (currentFrame / this.totalFrames) * 100;
                            if (progressCallback) {
                                progressCallback(progressPercentage);
                            }
                        }
                    });
                }
                return this;
            },
            onComplete: (onCompleteCallback) => {
                // Define uma função de conclusão para o processo
                if (processo !== undefined) {
                    processo.on('close', () => {
                        onCompleteCallback();
                    });
                }
                return this;
            },
        };
    }
}

/**
 * Função para criar uma instância da classe ffmpegClass.
 * 
 * @param {string} input - O caminho de entrada.
 * @param {string} output - O caminho de saída.
 * @param {string} quality - A quality desejada.
 * @returns {ffmpegClass} - A instância da classe ffmpegClass.
 */
module.exports = ffmpegClass;
