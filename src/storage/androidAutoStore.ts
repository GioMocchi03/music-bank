import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

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

export async function saveAndroidAutoCatalog(
  songs: Song[],
  client: NavidromeClient,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  const destination = new File(Paths.document, FILE_NAME);
  const temporary = new File(Paths.document, `${FILE_NAME}.tmp`);
  temporary.create({ overwrite: true, intermediates: true });
  temporary.write(await buildCatalog(songs, client));
  await temporary.move(destination, { overwrite: true });
}

export async function clearAndroidAutoCatalog(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const destination = new File(Paths.document, FILE_NAME);
  if (destination.exists) destination.delete();
}

export async function ensureAndroidAutoCatalog(
  songs: Song[],
  client: NavidromeClient,
): Promise<void> {
  if (Platform.OS !== 'android' || !songs.length) return;
  const destination = new File(Paths.document, FILE_NAME);
  if (!destination.exists) await saveAndroidAutoCatalog(songs, client);
}
