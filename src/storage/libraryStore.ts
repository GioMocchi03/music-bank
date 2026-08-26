import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import {
  cleanGenres,
  type Album,
  type Artist,
  type Genre,
  type InternetRadioStation,
  type Playlist,
  type Song,
} from '../subsonic/NavidromeClient';

const LEGACY_KEY = 'gio-music.library.v2';
const WEB_KEY = 'gio-music.library.v3';
const LEGACY_FILE_NAME = 'music-bank-library-v3.json';
const ROOT_DIRECTORY = 'music-bank-library-v4';
const MANIFEST_FILE = 'manifest.json';
const METADATA_FILE = 'metadata.json';
const SONG_CHUNK_SIZE = 500;

export type LibrarySnapshot = {
  albums: Album[];
  artists: Artist[];
  genres: Genre[];
  playlists: Playlist[];
  songs: Song[];
  radios: InternetRadioStation[];
  syncedAt: number;
};

type LibraryManifest = {
  version: 4;
  generation: string;
  songChunks: number;
  albums: number;
  artists: number;
  genres: number;
  playlists: number;
  songs: number;
  radios: number;
  syncedAt: number;
};

type LibraryMetadata = Omit<LibrarySnapshot, 'songs'>;

export type LibraryPreview = LibraryMetadata & {
  songCount: number;
};

function normalizeLibrary(parsed: Partial<LibrarySnapshot>): LibrarySnapshot {
  const albums = parsed.albums ?? [];
  const albumCovers = new Map(albums.map((album) => [album.id, album.coverUrl]));
  const storedGenres = parsed.genres ?? [];
  return {
    albums,
    artists: parsed.artists ?? [],
    genres: storedGenres.some((genre) => genre.sourceValues?.length)
      ? storedGenres
      : cleanGenres(storedGenres),
    playlists: parsed.playlists ?? [],
    songs: (parsed.songs ?? []).map((song) => ({
      ...song,
      coverUrl: song.albumId ? albumCovers.get(song.albumId) ?? song.coverUrl : song.coverUrl,
    })),
    radios: parsed.radios ?? [],
    syncedAt: parsed.syncedAt ?? 0,
  };
}

function parseLibrary(value: string): LibrarySnapshot {
  return normalizeLibrary(JSON.parse(value) as Partial<LibrarySnapshot>);
}

function stripSongCover(song: Song): Omit<Song, 'coverUrl'> {
  const { coverUrl: _coverUrl, ...storedSong } = song;
  return storedSong;
}

function assertManifest(manifest: Partial<LibraryManifest>): asserts manifest is LibraryManifest {
  if (
    manifest.version !== 4 ||
    typeof manifest.generation !== 'string' ||
    !manifest.generation ||
    !Number.isInteger(manifest.songChunks) ||
    !Number.isInteger(manifest.albums) ||
    !Number.isInteger(manifest.artists) ||
    !Number.isInteger(manifest.genres) ||
    !Number.isInteger(manifest.playlists) ||
    !Number.isInteger(manifest.songs) ||
    !Number.isInteger(manifest.radios) ||
    typeof manifest.syncedAt !== 'number' ||
    !Number.isFinite(manifest.syncedAt) ||
    [manifest.songChunks, manifest.albums, manifest.artists, manifest.genres,
      manifest.playlists, manifest.songs, manifest.radios].some((count) => (count ?? -1) < 0)
  ) {
    throw new Error('Indice della libreria non valido.');
  }
}

async function readGeneration(
  root: Directory,
  manifest: LibraryManifest,
): Promise<LibrarySnapshot> {
  const metadata = await readGenerationMetadata(root, manifest);
  const generation = new Directory(root, manifest.generation);
  const songs: Song[] = [];
  for (let index = 0; index < manifest.songChunks; index += 1) {
    const chunkFile = new File(generation, `songs-${index}.json`);
    if (!chunkFile.exists) throw new Error(`Blocco tracce ${index + 1} assente.`);
    const chunk = JSON.parse(await chunkFile.text()) as Song[];
    if (!Array.isArray(chunk)) throw new Error(`Blocco tracce ${index + 1} non valido.`);
    songs.push(...chunk);
  }

  const snapshot = normalizeLibrary({ ...metadata, songs });
  if (snapshot.songs.length !== manifest.songs) {
    throw new Error('Verifica della libreria salvata non riuscita.');
  }
  return snapshot;
}

async function readGenerationMetadata(
  root: Directory,
  manifest: LibraryManifest,
): Promise<LibraryPreview> {
  const generation = new Directory(root, manifest.generation);
  if (!generation.exists) throw new Error('Generazione della libreria assente.');

  const metadataFile = new File(generation, METADATA_FILE);
  if (!metadataFile.exists) throw new Error('Metadati della libreria assenti.');
  const parsed = JSON.parse(await metadataFile.text()) as Partial<LibraryMetadata>;
  const normalized = normalizeLibrary({ ...parsed, songs: [] });
  const preview: LibraryPreview = {
    albums: normalized.albums,
    artists: normalized.artists,
    genres: normalized.genres,
    playlists: normalized.playlists,
    radios: normalized.radios,
    syncedAt: normalized.syncedAt,
    songCount: manifest.songs,
  };
  if (
    preview.albums.length !== manifest.albums ||
    preview.artists.length !== manifest.artists ||
    preview.genres.length !== manifest.genres ||
    preview.playlists.length !== manifest.playlists ||
    preview.radios.length !== manifest.radios ||
    preview.syncedAt !== manifest.syncedAt
  ) {
    throw new Error('Verifica dei metadati salvati non riuscita.');
  }
  return preview;
}

async function readActiveManifest(): Promise<{
  root: Directory;
  manifest: LibraryManifest;
} | null> {
  const root = new Directory(Paths.document, ROOT_DIRECTORY);
  const manifestFile = new File(root, MANIFEST_FILE);
  if (!root.exists || !manifestFile.exists) return null;
  const manifest = JSON.parse(await manifestFile.text()) as Partial<LibraryManifest>;
  assertManifest(manifest);
  return { root, manifest };
}

async function loadChunkedLibrary(): Promise<LibrarySnapshot | null> {
  const active = await readActiveManifest();
  return active ? readGeneration(active.root, active.manifest) : null;
}

async function loadChunkedLibraryPreview(): Promise<LibraryPreview | null> {
  const active = await readActiveManifest();
  return active ? readGenerationMetadata(active.root, active.manifest) : null;
}

export async function saveLibrary(
  snapshot: LibrarySnapshot,
  onProgress?: (savedSongs: number, totalSongs: number) => void,
): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(WEB_KEY, JSON.stringify({
      ...snapshot,
      songs: snapshot.songs.map(stripSongCover),
    }));
    return;
  }

  const root = new Directory(Paths.document, ROOT_DIRECTORY);
  if (!root.exists) root.create({ idempotent: true, intermediates: true });
  const manifestDestination = new File(root, MANIFEST_FILE);
  let previousManifest: string | null = null;
  try {
    if (manifestDestination.exists) previousManifest = await manifestDestination.text();
  } catch {
    // Una manifest precedente non leggibile non e una base valida per il rollback.
  }
  let manifestCommitted = false;
  const generationName = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const generation = new Directory(root, generationName);
  generation.create({ intermediates: true });

  const manifest: LibraryManifest = {
    version: 4,
    generation: generationName,
    songChunks: Math.ceil(snapshot.songs.length / SONG_CHUNK_SIZE),
    albums: snapshot.albums.length,
    artists: snapshot.artists.length,
    genres: snapshot.genres.length,
    playlists: snapshot.playlists.length,
    songs: snapshot.songs.length,
    radios: snapshot.radios.length,
    syncedAt: snapshot.syncedAt,
  };

  try {
    const metadata: LibraryMetadata = {
      albums: snapshot.albums,
      artists: snapshot.artists,
      genres: snapshot.genres,
      playlists: snapshot.playlists,
      radios: snapshot.radios,
      syncedAt: snapshot.syncedAt,
    };
    const metadataFile = new File(generation, METADATA_FILE);
    metadataFile.create();
    metadataFile.write(JSON.stringify(metadata));

    for (let index = 0; index < manifest.songChunks; index += 1) {
      const start = index * SONG_CHUNK_SIZE;
      const chunk = snapshot.songs
        .slice(start, start + SONG_CHUNK_SIZE)
        .map(stripSongCover);
      const chunkFile = new File(generation, `songs-${index}.json`);
      chunkFile.create();
      chunkFile.write(JSON.stringify(chunk));
      onProgress?.(Math.min(start + chunk.length, snapshot.songs.length), snapshot.songs.length);
    }

    // Rilegge l'intera generazione prima di renderla attiva.
    await readGeneration(root, manifest);

    const manifestTemporary = new File(root, `${MANIFEST_FILE}.tmp`);
    manifestTemporary.create({ overwrite: true });
    manifestTemporary.write(JSON.stringify(manifest));
    await manifestTemporary.move(manifestDestination, { overwrite: true });
    manifestCommitted = true;

    const verified = await loadChunkedLibrary();
    if (!verified || verified.syncedAt !== snapshot.syncedAt) {
      throw new Error('La libreria non e rimasta leggibile dopo il salvataggio.');
    }

    // La nuova generazione e verificata: soltanto ora rimuoviamo quelle vecchie.
    for (const entry of root.list()) {
      if (entry instanceof Directory && entry.uri !== generation.uri) {
        try {
          entry.delete();
        } catch {}
      }
    }
    try {
      const legacyFile = new File(Paths.document, LEGACY_FILE_NAME);
      if (legacyFile.exists) legacyFile.delete();
    } catch {}
    try {
      await AsyncStorage.removeItem(LEGACY_KEY);
    } catch {}
  } catch (error) {
    if (manifestCommitted) {
      try {
        if (previousManifest) {
          manifestDestination.create({ overwrite: true });
          manifestDestination.write(previousManifest);
        } else if (manifestDestination.exists) {
          manifestDestination.delete();
        }
      } catch {
        // L'errore originale contiene gia il fallimento di persistenza rilevato.
      }
    }
    try {
      if (generation.exists) generation.delete();
    } catch {}
    throw error;
  }
}

export async function clearLibrary(): Promise<void> {
  await AsyncStorage.multiRemove([WEB_KEY, LEGACY_KEY]);
  if (Platform.OS === 'web') return;
  const legacyFile = new File(Paths.document, LEGACY_FILE_NAME);
  if (legacyFile.exists) legacyFile.delete();
  const root = new Directory(Paths.document, ROOT_DIRECTORY);
  if (root.exists) root.delete();
}

export async function loadLibrary(): Promise<LibrarySnapshot | null> {
  if (Platform.OS === 'web') {
    try {
      const value = await AsyncStorage.getItem(WEB_KEY)
        ?? await AsyncStorage.getItem(LEGACY_KEY);
      return value ? parseLibrary(value) : null;
    } catch {
      return null;
    }
  }

  try {
    const chunked = await loadChunkedLibrary();
    if (chunked) return chunked;
  } catch {
    // Prova la cache monolitica della versione precedente.
  }

  try {
    const legacyFile = new File(Paths.document, LEGACY_FILE_NAME);
    if (legacyFile.exists) {
      const snapshot = parseLibrary(await legacyFile.text());
      try {
        await saveLibrary(snapshot);
      } catch {}
      return snapshot;
    }
  } catch {
    // Prova l'ultima migrazione da AsyncStorage.
  }

  try {
    const legacyValue = await AsyncStorage.getItem(LEGACY_KEY);
    if (!legacyValue) return null;
    const snapshot = parseLibrary(legacyValue);
    try {
      await saveLibrary(snapshot);
    } catch {}
    return snapshot;
  } catch {
    return null;
  }
}

function snapshotToPreview(snapshot: LibrarySnapshot): LibraryPreview {
  return {
    albums: snapshot.albums,
    artists: snapshot.artists,
    genres: snapshot.genres,
    playlists: snapshot.playlists,
    radios: snapshot.radios,
    syncedAt: snapshot.syncedAt,
    songCount: snapshot.songs.length,
  };
}

/**
 * Carica soltanto i dati necessari al primo rendering. Su Android legge un
 * singolo file di metadati e non apre i blocchi delle tracce; questi possono
 * essere caricati in background con loadLibrary() dopo che la Home è visibile.
 */
export async function loadLibraryPreview(): Promise<LibraryPreview | null> {
  if (Platform.OS !== 'web') {
    try {
      const preview = await loadChunkedLibraryPreview();
      if (preview) return preview;
    } catch {
      // La migrazione legacy resta affidata al caricamento completo sottostante.
    }
  }

  const snapshot = await loadLibrary();
  return snapshot ? snapshotToPreview(snapshot) : null;
}
