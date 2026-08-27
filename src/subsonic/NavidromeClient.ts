import * as Crypto from 'expo-crypto';
import { md5 } from 'js-md5';
import { normalizeServerUrl } from '../utils/connection';

export type NavidromeConnection = {
  serverUrl: string;
  username: string;
  password: string;
};

export type Song = {
  /** Solo per copie locali: evita collisioni tra ID di server/account diversi. */
  offlineSourceKey?: string;
  id: string;
  title: string;
  album?: string;
  albumId?: string;
  artist?: string;
  artistId?: string;
  track?: number;
  discNumber?: number;
  duration?: number;
  year?: number;
  genre?: string;
  coverArt?: string;
  coverUrl?: string;
  starred?: string;
  suffix?: string;
  contentType?: string;
  bitRate?: number;
  bitDepth?: number;
  samplingRate?: number;
  channelCount?: number;
  size?: number;
  composer?: string;
  path?: string;
  playCount?: number;
  created?: string;
};

export type Album = {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  coverArt?: string;
  coverUrl?: string;
  songCount?: number;
  duration?: number;
  year?: number;
  genre?: string;
  starred?: string;
  created?: string;
  played?: string;
  playCount?: number;
  song?: Song[];
};

export type Artist = {
  id: string;
  name: string;
  albumCount?: number;
  coverArt?: string;
  artistImageUrl?: string;
  starred?: string;
  album?: Album[];
};

export type Genre = {
  value: string;
  songCount: number;
  albumCount: number;
  sourceValues?: string[];
};

export type Playlist = {
  id: string;
  name: string;
  owner?: string;
  public?: boolean;
  created?: string;
  changed?: string;
  comment?: string;
  songCount?: number;
  duration?: number;
  coverArt?: string;
  coverUrl?: string;
  entry?: Song[];
};

export type InternetRadioStation = {
  id: string;
  name: string;
  streamUrl: string;
  homePageUrl?: string;
};

export type SearchResults = {
  albums: Album[];
  artists: Artist[];
  songs: Song[];
};

type SubsonicPayload = {
  status: 'ok' | 'failed';
  error?: { code: number; message: string };
  albumList2?: { album?: Album[] };
  album?: Album;
  artists?: { index?: Array<{ name: string; artist?: Artist[] }> };
  artist?: Artist;
  genres?: { genre?: Genre[] };
  searchResult3?: { album?: Album[]; artist?: Artist[]; song?: Song[] };
  starred2?: { album?: Album[]; artist?: Artist[]; song?: Song[] };
  playlists?: { playlist?: Playlist[] };
  playlist?: Playlist;
  randomSongs?: { song?: Song[] };
  songsByGenre?: { song?: Song[] };
  internetRadioStations?: { internetRadioStation?: InternetRadioStation[] };
};

type SubsonicEnvelope = { 'subsonic-response': SubsonicPayload };
type RequestParams = Record<string, string | string[]>;

const API_VERSION = '1.16.1';
const CLIENT_NAME = 'music-bank';
const PAGE_SIZE = 500;
const REQUEST_TIMEOUT_MS = 20_000;

const GENRE_ALIASES: Record<string, string> = {
  hiphop: 'Hip-Hop',
  hiphoprap: 'Hip-Hop',
  raphiphop: 'Hip-Hop',
  randb: 'R&B',
  rnb: 'R&B',
  rhythmandblues: 'R&B',
  drumandbass: 'Drum & Bass',
  drumnbass: 'Drum & Bass',
  dnb: 'Drum & Bass',
  electronicdancemusic: 'EDM',
  edm: 'EDM',
  electronic: 'Elettronica',
  electronica: 'Elettronica',
  elettronica: 'Elettronica',
  rockandroll: 'Rock & Roll',
  rocknroll: 'Rock & Roll',
  alternativerock: 'Alternative Rock',
  altrock: 'Alternative Rock',
  indierock: 'Indie Rock',
  rootsreggae: 'Roots Reggae',
  reggaeroots: 'Roots Reggae',
  singersongwriter: 'Singer-Songwriter',
  cantautore: 'Cantautorato',
  cantautori: 'Cantautorato',
  cantautorato: 'Cantautorato',
  classical: 'Classica',
  classicalmusic: 'Classica',
  classica: 'Classica',
  musicaclassica: 'Classica',
  soundtrack: 'Soundtrack',
  soundtracks: 'Soundtrack',
  ost: 'Soundtrack',
  lofi: 'Lo-Fi',
  chillout: 'Chillout',
  newage: 'New Age',
  worldmusic: 'World Music',
  heavymetal: 'Heavy Metal',
  popitaliano: 'Pop Italiano',
  italianpop: 'Pop Italiano',
  rapitaliano: 'Rap Italiano',
  italianrap: 'Rap Italiano',
  idm: 'IDM',
  ebm: 'EBM',
  ukgarage: 'UK Garage',
  rb: 'R&B',
};

const IGNORED_GENRES = new Set([
  '',
  'unknown',
  'sconosciuto',
  'sconosciuta',
  'none',
  'null',
  'na',
  'nd',
  'other',
  'others',
  'altro',
  'vari',
  'various',
  'genre',
  'generico',
  'uncategorized',
  'uncategorised',
]);

function genreKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function genreLabel(value: string): string {
  const cleaned = value
    .replace(/[_]+/g, ' ')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  const key = genreKey(cleaned);
  if (GENRE_ALIASES[key]) return GENRE_ALIASES[key];
  const lowercaseWords = new Set(['and', 'e', 'ed', 'di', 'del', 'della', 'the']);
  return cleaned
    .toLocaleLowerCase('it')
    .split(' ')
    .map((word, index) =>
      index > 0 && lowercaseWords.has(word)
        ? word
        : word
            .split('-')
            .map((part) => part ? `${part[0].toLocaleUpperCase('it')}${part.slice(1)}` : part)
            .join('-'),
    )
    .join(' ');
}

export function cleanGenres(genres: Genre[]): Genre[] {
  const grouped = new Map<
    string,
    { value: string; songCount: number; albumCount: number; sourceValues: Set<string> }
  >();

  genres.forEach((genre) => {
    const sourceValue = String(genre.value ?? '').replace(/\s+/g, ' ').trim();
    sourceValue
      .split(/[;|\n]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const label = genreLabel(part);
        const key = genreKey(label);
        if (IGNORED_GENRES.has(key)) return;
        const current = grouped.get(key) ?? {
          value: label,
          songCount: 0,
          albumCount: 0,
          sourceValues: new Set<string>(),
        };
        current.songCount += Number(genre.songCount ?? 0);
        current.albumCount += Number(genre.albumCount ?? 0);
        current.sourceValues.add(sourceValue);
        grouped.set(key, current);
      });
  });

  return [...grouped.values()]
    .map((genre) => ({
      value: genre.value,
      songCount: genre.songCount,
      albumCount: genre.albumCount,
      sourceValues: [...genre.sourceValues].sort((a, b) => a.localeCompare(b, 'it')),
    }))
    .sort((a, b) => b.songCount - a.songCount || a.value.localeCompare(b.value, 'it'));
}

export class NavidromeClient {
  private readonly coverUrlCache = new Map<string, Promise<string>>();
  private readonly baseUrl: string;

  constructor(private readonly connection: NavidromeConnection) {
    this.baseUrl = normalizeServerUrl(connection.serverUrl);
    if (
      !/^https:\/\//i.test(this.baseUrl) &&
      !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(this.baseUrl)
    ) {
      throw new Error('Per sicurezza il server deve usare HTTPS.');
    }
  }

  async ping(signal?: AbortSignal): Promise<void> {
    await this.request('ping', {}, signal);
  }

  async getAlbums(
    type: 'recent' | 'newest' | 'frequent' | 'random' | 'alphabeticalByName' = 'recent',
    size = 50,
    offset = 0,
    signal?: AbortSignal,
  ): Promise<Album[]> {
    const payload = await this.request('getAlbumList2', {
      type,
      size: String(size),
      offset: String(offset),
    }, signal);
    return this.decorateAlbums(payload.albumList2?.album ?? []);
  }

  async getAllAlbums(
    onProgress?: (count: number) => void,
    signal?: AbortSignal,
  ): Promise<Album[]> {
    const result: Album[] = [];
    let offset = 0;
    while (true) {
      const page = await this.getAlbums('alphabeticalByName', PAGE_SIZE, offset, signal);
      result.push(...page);
      onProgress?.(result.length);
      if (page.length < PAGE_SIZE) break;
      offset += page.length;
    }
    return result;
  }

  async getAlbum(id: string, signal?: AbortSignal): Promise<Album> {
    const payload = await this.request('getAlbum', { id }, signal);
    if (!payload.album) throw new Error('Album non trovato.');
    const [album] = await this.decorateAlbums([payload.album]);
    album.song = await this.decorateSongs(payload.album.song ?? []);
    return album;
  }

  async getArtists(signal?: AbortSignal): Promise<Artist[]> {
    const payload = await this.request('getArtists', {}, signal);
    const artists = (payload.artists?.index ?? []).flatMap((entry) => entry.artist ?? []);
    return Promise.all(
      artists.map(async (artist) => ({
        ...artist,
        id: String(artist.id),
        artistImageUrl: artist.coverArt
          ? await this.coverArtUrl(String(artist.coverArt), 500)
          : undefined,
      })),
    );
  }

  async getArtist(id: string, signal?: AbortSignal): Promise<Artist> {
    const payload = await this.request('getArtist', { id }, signal);
    if (!payload.artist) throw new Error('Artista non trovato.');
    return {
      ...payload.artist,
      id: String(payload.artist.id),
      album: await this.decorateAlbums(payload.artist.album ?? []),
      artistImageUrl: payload.artist.coverArt
        ? await this.coverArtUrl(String(payload.artist.coverArt), 700)
        : undefined,
    };
  }

  async getGenres(signal?: AbortSignal): Promise<Genre[]> {
    const payload = await this.request('getGenres', {}, signal);
    return cleanGenres(payload.genres?.genre ?? []);
  }

  async getSongsByGenre(genre: string | string[], count = 500, offset = 0, signal?: AbortSignal): Promise<Song[]> {
    const sourceValues = Array.isArray(genre) ? genre : [genre];
    const pages = await Promise.all(
      sourceValues.map(async (sourceGenre) => {
        const songs: Song[] = [];
        const seenIds = new Set<string>();
        let nextOffset = offset;
        while (true) {
          const payload = await this.request('getSongsByGenre', {
            genre: sourceGenre,
            count: String(count),
            offset: String(nextOffset),
          }, signal);
          const page = payload.songsByGenre?.song ?? [];
          const fresh = page.filter((song) => {
            const id = String(song.id);
            if (seenIds.has(id)) return false;
            seenIds.add(id);
            return true;
          });
          songs.push(...fresh);
          if (page.length < count || fresh.length === 0) break;
          nextOffset += page.length;
        }
        return this.decorateSongs(songs);
      }),
    );
    const unique = new Map<string, Song>();
    pages.flat().forEach((song) => unique.set(song.id, song));
    return [...unique.values()];
  }

  async getRandomSongs(size = 100, genre?: string, signal?: AbortSignal): Promise<Song[]> {
    const payload = await this.request('getRandomSongs', {
      size: String(size),
      ...(genre ? { genre } : {}),
    }, signal);
    return this.decorateSongs(payload.randomSongs?.song ?? []);
  }

  async search(query: string, signal?: AbortSignal): Promise<SearchResults> {
    if (!query.trim()) return { albums: [], artists: [], songs: [] };
    const payload = await this.request('search3', {
      query: query.trim(),
      artistCount: '30',
      albumCount: '60',
      songCount: '100',
    }, signal);
    const result = payload.searchResult3 ?? {};
    return {
      albums: await this.decorateAlbums(result.album ?? []),
      artists: result.artist ?? [],
      songs: await this.decorateSongs(result.song ?? []),
    };
  }

  async getAllSongs(onProgress?: (count: number) => void, signal?: AbortSignal): Promise<Song[]> {
    const result: Song[] = [];
    const seen = new Set<string>();
    let offset = 0;
    while (true) {
      const payload = await this.request('search3', {
        query: '',
        artistCount: '0',
        albumCount: '0',
        songCount: String(PAGE_SIZE),
        songOffset: String(offset),
      }, signal);
      const page = await this.decorateSongs(payload.searchResult3?.song ?? []);
      const newSongs = page.filter((song) => !seen.has(song.id));
      newSongs.forEach((song) => seen.add(song.id));
      result.push(...newSongs);
      onProgress?.(result.length);
      if (page.length < PAGE_SIZE || newSongs.length === 0) break;
      offset += page.length;
    }
    return result;
  }

  async getStarred(signal?: AbortSignal): Promise<SearchResults> {
    const payload = await this.request('getStarred2', {}, signal);
    const result = payload.starred2 ?? {};
    return {
      albums: await this.decorateAlbums(result.album ?? []),
      artists: result.artist ?? [],
      songs: await this.decorateSongs(result.song ?? []),
    };
  }

  async setStarred(id: string, starred: boolean, signal?: AbortSignal): Promise<void> {
    await this.request(starred ? 'star' : 'unstar', { id }, signal);
  }

  async getPlaylists(signal?: AbortSignal): Promise<Playlist[]> {
    const payload = await this.request('getPlaylists', {}, signal);
    return Promise.all(
      (payload.playlists?.playlist ?? []).map(async (playlist) => ({
        ...playlist,
        id: String(playlist.id),
        coverUrl: playlist.coverArt
          ? await this.coverArtUrl(String(playlist.coverArt), 500)
          : undefined,
      })),
    );
  }

  async getPlaylist(id: string, signal?: AbortSignal): Promise<Playlist> {
    const payload = await this.request('getPlaylist', { id }, signal);
    if (!payload.playlist) throw new Error('Playlist non trovata.');
    return {
      ...payload.playlist,
      id: String(payload.playlist.id),
      entry: await this.decorateSongs(payload.playlist.entry ?? []),
      coverUrl: payload.playlist.coverArt
        ? await this.coverArtUrl(String(payload.playlist.coverArt), 500)
        : undefined,
    };
  }

  async createPlaylist(name: string, signal?: AbortSignal): Promise<Playlist | null> {
    const payload = await this.request('createPlaylist', { name }, signal);
    if (!payload.playlist) return null;
    return {
      ...payload.playlist,
      id: String(payload.playlist.id),
      entry: await this.decorateSongs(payload.playlist.entry ?? []),
      coverUrl: payload.playlist.coverArt
        ? await this.coverArtUrl(String(payload.playlist.coverArt), 500)
        : undefined,
    };
  }

  async addSongToPlaylist(playlistId: string, songId: string, signal?: AbortSignal): Promise<void> {
    await this.request('updatePlaylist', { playlistId, songIdToAdd: songId }, signal);
  }

  async updatePlaylistMetadata(
    playlistId: string,
    values: { name: string; comment?: string; public: boolean },
    signal?: AbortSignal,
  ): Promise<void> {
    await this.request('updatePlaylist', {
      playlistId,
      name: values.name,
      comment: values.comment ?? '',
      public: String(values.public),
    }, signal);
  }

  async replacePlaylistSongs(playlistId: string, songIds: string[], signal?: AbortSignal): Promise<void> {
    await this.request('createPlaylist', { playlistId, songId: songIds }, signal);
  }

  async deletePlaylist(playlistId: string, signal?: AbortSignal): Promise<void> {
    await this.request('deletePlaylist', { id: playlistId }, signal);
  }

  async getInternetRadioStations(signal?: AbortSignal): Promise<InternetRadioStation[]> {
    const payload = await this.request('getInternetRadioStations', {}, signal);
    return (payload.internetRadioStations?.internetRadioStation ?? []).map((station) => ({
      ...station,
      id: String(station.id),
    }));
  }

  streamUrl(songId: string): Promise<string> {
    return this.url('stream', {
      id: songId,
      format: 'raw',
      maxBitRate: '0',
      estimateContentLength: 'true',
    });
  }

  downloadUrl(songId: string): Promise<string> {
    return this.url('download', { id: songId });
  }

  coverArtUrl(coverArtId: string, size = 500): Promise<string> {
    const key = `${coverArtId}:${size}`;
    const cached = this.coverUrlCache.get(key);
    if (cached) return cached;
    const url = this.url('getCoverArt', { id: coverArtId, size: String(size) });
    this.coverUrlCache.set(key, url);
    return url;
  }

  async scrobble(songId: string, submission: boolean, signal?: AbortSignal): Promise<void> {
    await this.request('scrobble', { id: songId, submission: String(submission) }, signal);
  }

  private async decorateAlbums(albums: Album[]): Promise<Album[]> {
    return Promise.all(
      albums.map(async (album) => ({
        ...album,
        id: String(album.id),
        artistId: album.artistId ? String(album.artistId) : undefined,
        coverUrl: album.coverArt
          ? await this.coverArtUrl(String(album.coverArt), 500)
          : undefined,
      })),
    );
  }

  private async decorateSongs(songs: Song[]): Promise<Song[]> {
    return Promise.all(
      songs.map(async (song) => ({
        ...song,
        id: String(song.id),
        albumId: song.albumId ? String(song.albumId) : undefined,
        artistId: song.artistId ? String(song.artistId) : undefined,
        coverUrl: song.coverArt
          ? await this.coverArtUrl(String(song.coverArt), 500)
          : undefined,
      })),
    );
  }

  private authParams(): Record<string, string> {
    const salt = Crypto.randomUUID().replaceAll('-', '').slice(0, 16);
    return {
      u: this.connection.username,
      t: md5(`${this.connection.password}${salt}`),
      s: salt,
      v: API_VERSION,
      c: CLIENT_NAME,
      f: 'json',
    };
  }

  private url(endpoint: string, params: RequestParams): Promise<string> {
    const query = new URLSearchParams(this.authParams());
    Object.entries(params).forEach(([key, value]) => {
      (Array.isArray(value) ? value : [value]).forEach((entry) => query.append(key, entry));
    });
    return Promise.resolve(`${this.baseUrl}/rest/${endpoint}.view?${query.toString()}`);
  }

  private async request(
    endpoint: string,
    params: RequestParams = {},
    externalSignal?: AbortSignal,
  ): Promise<SubsonicPayload> {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
    if (externalSignal?.aborted) controller.abort();
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      let response: Response;
      try {
        response = await fetch(await this.url(endpoint, params), { signal: controller.signal });
      } catch (error) {
        if (timedOut) {
          throw new Error(`Navidrome non ha risposto entro ${REQUEST_TIMEOUT_MS / 1000} secondi.`);
        }
        if (externalSignal?.aborted) throw new Error('Richiesta annullata.');
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Navidrome non raggiungibile. Dettaglio: ${detail}`);
      }
      if (!response.ok) throw new Error(`Server non raggiungibile (${response.status}).`);

      let envelope: SubsonicEnvelope;
      try {
        envelope = (await response.json()) as SubsonicEnvelope;
      } catch {
        if (timedOut) {
          throw new Error(`Navidrome non ha completato la risposta entro ${REQUEST_TIMEOUT_MS / 1000} secondi.`);
        }
        if (externalSignal?.aborted) throw new Error('Richiesta annullata.');
        throw new Error('Navidrome ha restituito una risposta non valida o incompleta.');
      }
      const payload = envelope['subsonic-response'];
      if (!payload || payload.status !== 'ok') {
        throw new Error(payload?.error?.message ?? 'Risposta Navidrome non valida.');
      }
      return payload;
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromCaller);
    }
  }
}
