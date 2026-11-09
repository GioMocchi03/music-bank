import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { refreshAndroidAutoCatalog } from '../native/androidAuto';

import { NavidromeClient, type Song, type Album, type Artist, type Genre, type Playlist, type InternetRadioStation } from '../subsonic/NavidromeClient';

const FILE_NAME = 'music-bank-auto-catalog.json';
const META_FILE_NAME = 'music-bank-auto-catalog.meta.json';
const CATALOG_VERSION = 3;
const SONG_BATCH = 500;

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
  syncedAt?: number;
};

type CatalogMeta = { version: number; syncedAt: number; credentials: string; signature: string };

function librarySignature(songs: Song[], metadata?: CatalogMetadata): string {
  const playlists = (metadata?.playlists ?? []).map((p) => `${p.id}:${p.songCount ?? ''}:${p.changed ?? ''}`);
  return [songs.length, metadata?.albums?.length ?? 0, metadata?.radios?.length ?? 0, ...playlists].join('|');
}

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

const yieldToEvents = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function readMeta(): Promise<CatalogMeta | null> {
  try {
    const file = new File(Paths.document, META_FILE_NAME);
    if (!file.exists) return null;
    return JSON.parse(await file.text()) as CatalogMeta;
  } catch {
    return null;
  }
}

function deleteMeta(): void {
  try {
    const file = new File(Paths.document, META_FILE_NAME);
    if (file.exists) file.delete();
  } catch {}
}

function writeMeta(meta: CatalogMeta): void {
  try {
    const file = new File(Paths.document, META_FILE_NAME);
    file.create({ overwrite: true, intermediates: true });
    file.write(JSON.stringify(meta));
  } catch {
    // Senza marcatore il catalogo viene semplicemente rigenerato al prossimo avvio.
  }
}

async function buildPlaylistEntries(
  playlists: Playlist[],
  client: NavidromeClient,
  loadPrevious: () => Promise<PreviousPlaylistIds>,
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
        songIds = (await loadPrevious()).get(playlist.id);
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
) {
  const autoSongs: AndroidAutoSong[] = [];
  for (let offset = 0; offset < songs.length; offset += SONG_BATCH) {
    const batch = songs.slice(offset, offset + SONG_BATCH);
    const urls = await client.streamUrls(batch.map((song) => song.id));
    batch.forEach((song, index) => {
      autoSongs.push({
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
        streamUrl: urls[index],
      });
    });
    // Lascia passare tocchi e rendering tra un blocco e l'altro.
    await yieldToEvents();
  }
  // Il catalogo precedente serve solo se una playlist non è raggiungibile.
  let previous: Promise<PreviousPlaylistIds> | undefined;
  const loadPrevious = () => (previous ??= readPreviousCatalogue().then(previousPlaylistIds));
  const playlists = await buildPlaylistEntries(metadata?.playlists ?? [], client, loadPrevious);
  const radios: AndroidAutoRadio[] = (metadata?.radios ?? [])
    .filter((station) => typeof station.streamUrl === 'string' && !!station.streamUrl.trim())
    .map((station) => ({
      id: station.id,
      name: station.name,
      streamUrl: station.streamUrl,
      homePageUrl: station.homePageUrl,
    }));
  await yieldToEvents();
  return JSON.stringify({
    version: CATALOG_VERSION,
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
  return enqueue(() => writeCatalog(songs, client, metadata));
}

async function writeCatalog(songs: Song[], client: NavidromeClient, metadata?: CatalogMetadata): Promise<void> {
  // Finish network/crypto work before touching the last usable catalogue.
  const contents = await buildCatalog(songs, client, metadata);
  deleteMeta();
  const destination = new File(Paths.document, FILE_NAME);
  const temporary = new File(Paths.document, `${FILE_NAME}.tmp`);
  try {
    temporary.create({ overwrite: true, intermediates: true });
    temporary.write(contents);
    await temporary.move(destination, { overwrite: true });
    if (metadata?.syncedAt !== undefined) {
      writeMeta({
        version: CATALOG_VERSION,
        syncedAt: metadata.syncedAt,
        credentials: client.credentialFingerprint(),
        signature: librarySignature(songs, metadata),
      });
    }
    await refreshAndroidAutoCatalog();
  } finally {
    // move() changes the File object's URI to the destination.
    const leftover = new File(Paths.document, `${FILE_NAME}.tmp`);
    if (leftover.exists) leftover.delete();
  }
}

export function clearAndroidAutoCatalog(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  return enqueue(async () => {
    deleteMeta();
    const destination = new File(Paths.document, FILE_NAME);
    if (destination.exists) destination.delete();
    await refreshAndroidAutoCatalog();
  });
}

export function ensureAndroidAutoCatalog(songs: Song[], client: NavidromeClient, metadata?: CatalogMetadata): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  // Freshness comes only from the marker written with the catalogue: same library sync,
  // same credentials and same format. Song count or file existence are not enough.
  return enqueue(async () => {
    const meta = await readMeta();
    const fresh = meta
      && metadata?.syncedAt !== undefined
      && meta.version === CATALOG_VERSION
      && meta.syncedAt === metadata.syncedAt
      && meta.credentials === client.credentialFingerprint()
      && meta.signature === librarySignature(songs, metadata)
      && new File(Paths.document, FILE_NAME).exists;
    if (!fresh) await writeCatalog(songs, client, metadata);
  });
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
