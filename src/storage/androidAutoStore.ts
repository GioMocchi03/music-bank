import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { refreshAndroidAutoCatalog } from '../native/androidAuto';

import { NavidromeClient, type Song } from '../subsonic/NavidromeClient';

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
  genre?: string;
  coverUrl?: string;
  streamUrl: string;
};

async function buildCatalog(songs: Song[], client: NavidromeClient) {
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
        genre: song.genre,
        coverUrl: song.coverUrl,
        streamUrl: await client.streamUrl(song.id),
      })),
    );
    autoSongs.push(...batch);
  }
  return JSON.stringify({ version: 1, updatedAt: Date.now(), songs: autoSongs });
}

// Serialize writers (including logout) so a stale sync cannot race a new catalogue.
let writes: Promise<void> = Promise.resolve();
function enqueue(write: () => Promise<void>): Promise<void> {
  const result = writes.catch(() => {}).then(write);
  writes = result;
  return result;
}

export function saveAndroidAutoCatalog(songs: Song[], client: NavidromeClient): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  return enqueue(async () => {
    // Finish network/crypto work before touching the last usable catalogue.
    const contents = await buildCatalog(songs, client);
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

export function ensureAndroidAutoCatalog(songs: Song[], client: NavidromeClient): Promise<void> {
  // Existing files may have stale metadata, credentials or removed songs; empty libraries
  // must also replace old contents. Do not infer freshness from existence or song count.
  return saveAndroidAutoCatalog(songs, client);
}
