/**
 * Classe para pesquisa de música utilizando a API do YouTube Music.
 * Permite buscar músicas, álbuns, playlists, sugestões, e mais.
 */
module.exports = class YouTubeMusicSearch {
    static module = null;

    /**
     * Carrega o módulo `node-youtube-music` de forma assíncrona.
     */
    static async loadModule() {
        if (!YouTubeMusicSearch.module) {
            YouTubeMusicSearch.module = await import('node-youtube-music');
        }
    }

    /**
     * Busca músicas no YouTube Music com base em uma query de pesquisa.
     * @param {string} query A query de pesquisa para as músicas.
     * @returns {Promise<Object[]>} Uma promessa que resolve com o resultado da pesquisa.
     */
    static async searchMusics(query) {
        await YouTubeMusicSearch.loadModule();
        return YouTubeMusicSearch.module.searchMusics(query);
    }

    /**
     * Busca álbuns no YouTube Music com base em uma query de pesquisa.
     * @param {string} query A query de pesquisa para os álbuns.
     * @returns {Promise<Object[]>} Uma promessa que resolve com o resultado da pesquisa.
     */
    static async searchAlbums(query) {
        await YouTubeMusicSearch.loadModule();
        return YouTubeMusicSearch.module.searchAlbums(query);
    }

    /**
     * Busca playlists no YouTube Music com base em uma query de pesquisa.
     * @param {string} query A query de pesquisa para as playlists.
     * @returns {Promise<Object[]>} Uma promessa que resolve com o resultado da pesquisa.
     */
    static async searchPlaylists(query) {
        await YouTubeMusicSearch.loadModule();
        return YouTubeMusicSearch.module.searchPlaylists(query);
    }

    /**
     * Obtém sugestões de músicas no YouTube Music com base em um ID de vídeo.
     * @param {string} videoId O ID do vídeo para o qual obter sugestões.
     * @returns {Promise<Object[]>} Uma promessa que resolve com as sugestões de músicas.
     */
    static async getSuggestions(videoId) {
        await YouTubeMusicSearch.loadModule();
        return YouTubeMusicSearch.module.getSuggestions(videoId);
    }

    /**
     * Lista músicas de um álbum específico.
     * @param {string} albumId O ID do álbum.
     * @returns {Promise<Object[]>} Uma promessa que resolve com a lista de músicas do álbum.
     */
    static async listMusicsFromAlbum(albumId) {
        await YouTubeMusicSearch.loadModule();
        return YouTubeMusicSearch.module.listMusicsFromAlbum(albumId);
    }

    /**
     * Lista músicas de uma playlist específica.
     * @param {string} playlistId O ID da playlist.
     * @returns {Promise<Object[]>} Uma promessa que resolve com a lista de músicas da playlist.
     */
    static async listMusicsFromPlaylist(playlistId) {
        await YouTubeMusicSearch.loadModule();
        return YouTubeMusicSearch.module.listMusicsFromPlaylist(playlistId);
    }

    /**
     * Busca artistas no YouTube Music com base em uma query de pesquisa.
     * @param {string} artistQuery A query de pesquisa para os artistas.
     * @param {Object} [options] Opções adicionais para a pesquisa de artistas.
     * @returns {Promise<Object[]>} Uma promessa que resolve com o resultado da pesquisa de artistas.
     */
    static async searchArtists(artistQuery, options) {
        await YouTubeMusicSearch.loadModule();
        return YouTubeMusicSearch.module.searchArtists(artistQuery, options);
    }

    /**
     * Obtém detalhes de um artista específico.
     * @param {string} artistId O ID do artista.
     * @param {Object} [options] Opções adicionais para obter detalhes do artista.
     * @returns {Promise<Object>} Uma promessa que resolve com os detalhes do artista.
     */
    static async getArtist(artistId, options) {
        await YouTubeMusicSearch.loadModule();
        return YouTubeMusicSearch.module.getArtist(artistId, options);
    }
}
