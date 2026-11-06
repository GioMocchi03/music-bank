import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { refreshAndroidAutoCatalog } from '../native/androidAuto';

import { NavidromeClient, type Song, type Album, type Artist, type Genre, type Playlist, type InternetRadioStation } from '../subsonic/NavidromeClient';

const FILE_NAME = 'music-bank-auto-catalog.json';

type AndroidAutoSong = {
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
  coverUrl?: string;
  starred?: string;
  streamUrl: string;
};

type AndroidAutoPlaylist = {
  id: string;
  name: string;
  owner?: string;
  coverUrl?: string;
  songIds: string[];
};

type AndroidAutoRadio = {
  id: string;
  name: string;
  streamUrl: string;
  homePageUrl?: string;
};

type CatalogMetadata = {
  albums: Album[];
  artists: Artist[];
  genres: Genre[];
  playlists?: Playlist[];
  radios?: InternetRadioStation[];
};

type PreviousPlaylistIds = Map<string, string[]>;

const PLAYLIST_ENTRY_BATCH = 6;

function previousPlaylistIds(catalogue: unknown): PreviousPlaylistIds {
  const ids: PreviousPlaylistIds = new Map();
  if (!catalogue || typeof catalogue !== 'object') return ids;
  const playlists = (catalogue as { playlists?: unknown }).playlists;
  if (!Array.isArray(playlists)) return ids;
  playlists.forEach((playlist) => {
    if (!playlist || typeof playlist !== 'object') return;
    const entry = playlist as { id?: unknown; songIds?: unknown };
    if (typeof entry.id !== 'string' || !entry.id) return;
    const songIds = Array.isArray(entry.songIds)
      ? entry.songIds.filter((id): id is string => typeof id === 'string' && !!id)
      : [];
    ids.set(entry.id, songIds);
  });
  return ids;
}

async function readPreviousCatalogue(): Promise<unknown> {
  try {
    const source = new File(Paths.document, FILE_NAME);
    return source.exists ? JSON.parse(await source.text()) : null;
  } catch {
    return null;
  }
}

async function buildPlaylistEntries(
  playlists: Playlist[],
  client: NavidromeClient,
  previous: PreviousPlaylistIds,
): Promise<AndroidAutoPlaylist[]> {
  const result: AndroidAutoPlaylist[] = new Array(playlists.length);
  for (let offset = 0; offset < playlists.length; offset += PLAYLIST_ENTRY_BATCH) {
    const batch = playlists.slice(offset, offset + PLAYLIST_ENTRY_BATCH);
    await Promise.all(batch.map(async (playlist, index) => {
      let songIds: string[] | undefined;
      try {
        const entries = await client.getPlaylistEntries(playlist.id);
        songIds = entries.map((entry) => String(entry.id)).filter(Boolean);
      } catch {
        // Senza rete si conservano i contenuti del catalogo precedente.
        songIds = previous.get(playlist.id);
      }
      result[offset + index] = {
        id: playlist.id,
        name: playlist.name,
        owner: playlist.owner,
        coverUrl: playlist.coverUrl,
        songIds: songIds ?? [],
      };
    }));
  }
  return result;
}

async function buildCatalog(
  songs: Song[],
  client: NavidromeClient,
  metadata?: CatalogMetadata,
  previous?: PreviousPlaylistIds,
) {
  const autoSongs: AndroidAutoSong[] = [];
  const batchSize = 250;
  for (let offset = 0; offset < songs.length; offset += batchSize) {
    const batch = await Promise.all(
      songs.slice(offset, offset + batchSize).map(async (song) => ({
        id: song.id,
        title: song.title,
        album: song.album,
        albumId: song.albumId,
        artist: song.artist,
        artistId: song.artistId,
        track: song.track,
        discNumber: song.discNumber,
        duration: song.duration,
        year: song.year,
        genre: song.genre,
        starred: song.starred,
        coverUrl: song.coverUrl,
        streamUrl: await client.streamUrl(song.id),
      })),
    );
    autoSongs.push(...batch);
  }
  const playlists = await buildPlaylistEntries(metadata?.playlists ?? [], client, previous ?? new Map());
  const radios: AndroidAutoRadio[] = (metadata?.radios ?? [])
    .filter((station) => typeof station.streamUrl === 'string' && !!station.streamUrl.trim())
    .map((station) => ({
      id: station.id,
      name: station.name,
      streamUrl: station.streamUrl,
      homePageUrl: station.homePageUrl,
    }));
  return JSON.stringify({
    version: 3,
    updatedAt: Date.now(),
    albums: metadata?.albums,
    artists: metadata?.artists,
    genres: metadata?.genres,
    playlists,
    radios,
    songs: autoSongs,
  });
}

// Serialize writers (including logout) so a stale sync cannot race a new catalogue.
let writes: Promise<void> = Promise.resolve();
function enqueue(write: () => Promise<void>): Promise<void> {
  const result = writes.catch(() => {}).then(write);
  writes = result;
  return result;
}

export function saveAndroidAutoCatalog(songs: Song[], client: NavidromeClient, metadata?: CatalogMetadata): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  return enqueue(async () => {
    // Finish network/crypto work before touching the last usable catalogue.
    const previous = previousPlaylistIds(await readPreviousCatalogue());
    const contents = await buildCatalog(songs, client, metadata, previous);
    const destination = new File(Paths.document, FILE_NAME);
    const temporary = new File(Paths.document, `${FILE_NAME}.tmp`);
    try {
      temporary.create({ overwrite: true, intermediates: true });
      temporary.write(contents);
      await temporary.move(destination, { overwrite: true });
      await refreshAndroidAutoCatalog();
    } finally {
      // move() changes the File object's URI to the destination.
      const leftover = new File(Paths.document, `${FILE_NAME}.tmp`);
      if (leftover.exists) leftover.delete();
    }
  });
}

export function clearAndroidAutoCatalog(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  return enqueue(async () => {
    const destination = new File(Paths.document, FILE_NAME);
    if (destination.exists) destination.delete();
    await refreshAndroidAutoCatalog();
  });
}

export function ensureAndroidAutoCatalog(songs: Song[], client: NavidromeClient, metadata?: CatalogMetadata): Promise<void> {
  // Existing files may have stale metadata, credentials or removed songs; empty libraries
  // must also replace old contents. Do not infer freshness from existence or song count.
  return saveAndroidAutoCatalog(songs, client, metadata);
}

/** Update the private catalogue without regenerating authenticated stream URLs. */
export function updateAndroidAutoFavorite(songId: string, starred?: string): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  return enqueue(async () => {
    const destination = new File(Paths.document, FILE_NAME);
    if (!destination.exists) return;
    const catalog = JSON.parse(await destination.text());
    catalog.songs = catalog.songs.map((song: AndroidAutoSong) => song.id === songId ? { ...song, starred } : song);
    catalog.updatedAt = Date.now();
    const temporary = new File(Paths.document, `${FILE_NAME}.tmp`);
    try {
      temporary.create({ overwrite: true, intermediates: true });
      temporary.write(JSON.stringify(catalog));
      await temporary.move(destination, { overwrite: true });
      await refreshAndroidAutoCatalog();
    } finally {
      const leftover = new File(Paths.document, `${FILE_NAME}.tmp`);
      if (leftover.exists) leftover.delete();
    }
  });
}
