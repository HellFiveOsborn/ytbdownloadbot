const { spawn } = require('child_process');
const path = require('path');

/**
 * Conversor FFMPEG
 */
class ffmpegClass {
    constructor(input, output, qualidade) {
        this.input = input;
        this.output = output;
        this.qualidade = qualidade;
        this.totalFrames = 0;
        this.ffmpegProcess = null;
        this.processes = new Map(); // Armazena os processos em segundo plano
        this.progressValue = 0;
        this.onCompleteCallback = null;
    }

    frames(callback) {
        const args = [
            '-i', this.input,
            '-vcodec', 'copy',
            '-f', 'null',
            '-'
        ];

        const ffmpegProcess = spawn('ffmpeg', args);

        ffmpegProcess.stderr.on('data', (data) => {
            const log = data.toString();
            const frameMatch = log.match(/frame=\s(?<frames>\d+)/);
            if (frameMatch && frameMatch[1]) {
                this.totalFrames = parseInt(frameMatch[1]);
            }
        });

        ffmpegProcess.on('close', (code) => {
            if (code === 0) {
                if (callback) {
                    callback(null, this.totalFrames);
                }
            } else {
                if (callback) {
                    callback(new Error(`FFmpeg process exited with code ${code}`));
                }
            }
        });

        ffmpegProcess.on('error', (error) => {
            if (callback) {
                callback(error);
            }
        });
    }

    getVideoResolution(callback) {
        const ffprobe = spawn('ffprobe', [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height',
            '-of', 'csv=p=0:s=x',
            this.input
        ]);

        let resolution = '';

        ffprobe.stdout.on('data', (data) => {
            resolution += data.toString();
        });

        ffprobe.on('close', (code) => {
            if (code === 0) {
                const res = resolution.trim().split('x');
                const width = parseInt(res[0]);
                const height = parseInt(res[1]);
                callback(null, { width, height });
            } else {
                callback(new Error(`Failed to get video resolution. FFprobe exited with code ${code}`));
            }
        });
    }

    // convert() {
    //     this.frames();

    //     const qualityMappings = {
    //         '144p': { width: 256, height: 144 },
    //         '240p': { width: 426, height: 240 },
    //         '360p': { width: 640, height: 360 },
    //         '480p': { width: 854, height: 480 },
    //         '720p': { width: 1280, height: 720 },
    //         '1080p': { width: 1920, height: 1080 },
    //     };

    //     const defaultQuality = '360p'; // Qualidade padrão
    //     const targetResolution = qualityMappings[this.qualidade] || qualityMappings[defaultQuality];

    //     const args = [
    //         '-i', this.input,
    //         '-y',
    //         '-vf', `scale=${targetResolution.width}:${targetResolution.height}`,
    //         '-c:v', 'libx264',
    //         '-crf', '20', // Valor de qualidade constante
    //         '-c:a', 'aac',
    //         this.output
    //     ];

    //     this.ffmpegProcess = spawn('ffmpeg', args);

    //     // Adicione o processo à lista de processos em segundo plano
    //     this.processes.set(`ffmpeg_processo_${this.ffmpegProcess.pid}`, this.ffmpegProcess);

    //     // Adicione um ouvinte para o evento 'close' do processo
    //     this.ffmpegProcess.on('close', (code) => {
    //         this.processes.delete(this.ffmpegProcess.pid);

    //         if (code === 0) {
    //             if (this.onCompleteCallback) {
    //                 this.onCompleteCallback({
    //                     arquivo: this.output
    //                 });
    //             }
    //         } else {
    //             // Trate o erro se o processo ffmpeg terminar com código diferente de 0
    //             console.error(`FFmpeg process exited with code ${code}`);
    //         }
    //     });


    //     return this;
    // }

    convert() {
        this.frames();

        const isAudioConversion = ['.mp3', '.m4a', '.wav'].includes(path.extname(this.output).toLowerCase());

        const qualityMappings = {
            '144p': { width: 256, height: 144 },
            '240p': { width: 426, height: 240 },
            '360p': { width: 640, height: 360 },
            '480p': { width: 854, height: 480 },
            '720p': { width: 1280, height: 720 },
            '1080p': { width: 1920, height: 1080 },
        };

        const qualityMappingsAudio = {
            128: '128k',
            192: '192k',
            320: '320k'
        }

        const defaultQuality = '360p'; // Qualidade padrão
        const targetResolution = qualityMappings[this.qualidade] || qualityMappings[defaultQuality];

        const defaultQualityAudio = 128; // Qualidade padrão audio
        const targetResolutionAudio = qualityMappingsAudio[this.qualidade] || qualityMappingsAudio[defaultQualityAudio];

        const argumentos = ['-i', this.input, '-y'];

        // Verifica se é uma conversão de vídeo para áudio
        if (isAudioConversion) {
            argumentos.push('-vn'); // Remove vídeo
            const extensao = path.extname(this.output).toLowerCase();
            if (extensao === '.mp3' || extensao === '.wav') {
                argumentos.push('-ab', targetResolutionAudio); // Qualidade de áudio padrão
                argumentos.push('-c:a', extensao.substring(1)); // Define o codec de áudio com base na extensão
            }
            if (extensao === '.m4a') {
                // ffmpeg -i .\UOKMXVSDCEPP.mp4 -y -vn -c:a aac -strict -2 -b:a 128k .\UOKMXVSDCEPP.m4a
                argumentos.push('-c:a', 'aac');
                argumentos.push('-strict', '-2');
                argumentos.push('-b:a', targetResolutionAudio);
            }
        } else {
            argumentos.push('-vf', `scale=${targetResolution.width}:${targetResolution.height}`);
            argumentos.push('-c:v', 'libx264');
            argumentos.push('-crf', '20'); // Valor de qualidade constante
            argumentos.push('-c:a', 'aac');
        }

        argumentos.push(this.output);

        this.ffmpegProcess = spawn('ffmpeg', argumentos);

        // Adicione o processo à lista de processos em segundo plano
        this.processes.set(`ffmpeg_processo_${this.ffmpegProcess.pid}`, this.ffmpegProcess);

        // Adicione um ouvinte para o evento 'close' do processo
        this.ffmpegProcess.on('close', (code) => {
            this.processes.delete(this.ffmpegProcess.pid);

            if (code === 0) {
                if (this.onCompleteCallback) {
                    this.onCompleteCallback({
                        arquivo: this.output
                    });
                }
            } else {
                // Trate o erro se o processo ffmpeg terminar com código diferente de 0
                console.error(`FFmpeg process exited with code ${code}`);
            }
        });

        return this;
    }

    start() {
        this.convert() // Inicializa a conversão

        this.processo_id = this.ffmpegProcess.pid;

        return this;
    }

    progress(callback) {
        if (this.ffmpegProcess !== null && !this.ffmpegProcess.killed) {
            this.ffmpegProcess.stderr.on('data', (data) => {
                const output = data.toString('utf-8');

                if (output.includes('frame=')) {
                    const frameMatch = output.match(/frame=\s(?<frames>\d+)/); //output.match(/frame=\s+(?<frames>\d{1,})\sfps=\s?(?<fps>\d{1,}\.?\d?)\s.*size=\s+(?<size>\w+)\stime=(?<time>\w+.{6}\.\d+)\sbitrate=\s+(?<bitrate>\d{1,}\.\d+.*)\sspeed=\s?(?<speed>\d{1,}\.\d{1,2}\w)$/);

                    if (frameMatch && frameMatch[1]) {
                        const currentFrame = parseInt(frameMatch[1]);
                        const progressPercentage = (currentFrame / this.totalFrames) * 100;

                        this.progressValue = progressPercentage;

                        setTimeout(() => {
                            if (callback) {
                                callback({ porcentagem: progressPercentage.toFixed(1) });
                            } else {
                                return { porcentagem: progressPercentage.toFixed(1) }
                            }
                        }, 1000)

                    }
                }
            });

            // Quando a conversão estiver concluída ou o processo for encerrado
            this.ffmpegProcess.on('close', () => {
                this.ffmpegProcess.stderr.removeAllListeners('data'); // Remove todos os ouvintes de 'data'
            });
        }
        return this;
    }

    onComplete(callback) {
        this.onCompleteCallback = callback;
        return this;
    }

    get(id) {
        // Retorna um objeto que permite encadear métodos progress() e onComplete() para o processo específico
        const processo = this.processes.get(`ffmpeg_processo_${id}`);

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
 * @param {string} qualidade - A qualidade desejada.
 * @returns {ffmpegClass} - A instância da classe ffmpegClass.
 */
module.exports = (input, output, qualidade) => {
    const ffmpeg = new ffmpegClass(input, output, qualidade);
    return ffmpeg;
}
