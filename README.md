# YTBMusicDownloadBot

Esse é um bot do Telegram para baixar músicas do YouTube Music.

## Funcionalidades

- Baixa a música em mp3
- Envia a música como arquivo de áudio pelo Telegram
- Salva um histórico das músicas baixadas por cada usuário

## Começando

### Pré-requisitos

- Node.js (versão 16+) 
- ffmpeg/ffprobe
- yt-dlp

### Instalação

```bash
git clone https://github.com/HellFiveOsborn/ytbdownloadbot
cd ytbdownloadbot
yarn ou npm install

Crie um arquivo `.env` com a chave de API do seu bot:
`BOT_TOKEN=SEU_TOKEN_AQUI`

**Executando**
`yarn ou npm: start`

O bot irá iniciar. Converse com ele pelo Telegram para baixar músicas!

**Tecnologias**

- [Telegraf](https://telegraf.js.org/) - Framework do Telegram para Node.js
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Baixar vídeos do YouTube
- [Better SQLite3](https://github.com/WiseLibs/better-sqlite3) - Banco de dados
- [Sharp](https://sharp.pixelplumbing.com/) - Conversão de imagens

**Licença**
Este projeto é licenciado sob a Licença MIT.

