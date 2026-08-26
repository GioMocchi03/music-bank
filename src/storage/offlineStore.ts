import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { createDownloadResumable } from 'expo-file-system/legacy';

import type { Song } from '../subsonic/NavidromeClient';
import { deletePrivateJson, readPrivateJson, writePrivateJson } from './privateJsonStore';
import { downloadKey } from '../utils/downloads';

const KEY = 'gio-music.offline.v1';
const FILE_NAME = 'music-bank-offline-v1.json';

export type OfflineTrack = {
  song: Song;
  localUri: string;
  downloadedAt: number;
  size?: number;
};

function isOfflineTrack(value: unknown): value is OfflineTrack {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<OfflineTrack>;
  return typeof entry.localUri === 'string' && !!entry.localUri
    && typeof entry.downloadedAt === 'number'
    && !!entry.song
    && typeof entry.song.id === 'string'
    && typeof entry.song.title === 'string';
}

function stableFileStem(id: string): string {
  const readable = id.replace(/[^a-z0-9._-]+/gi, '_').replace(/^\.+/, '').slice(0, 80) || 'track';
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${readable}-${(hash >>> 0).toString(16)}`;
}

export async function loadOfflineTracks(legacySourceKey = 'legacy'): Promise<OfflineTrack[]> {
  const stored = await readPrivateJson<unknown>(FILE_NAME, KEY);
  if (!Array.isArray(stored)) return [];
  const tracks = stored.filter(isOfflineTrack).filter((entry) => {
    if (Platform.OS === 'web') return true;
    try {
      const file = new File(entry.localUri);
      const expectedSize = entry.size && entry.size > 0 ? entry.size : entry.song.size;
      return file.exists && file.size > 0 && (!expectedSize || file.size === expectedSize);
    } catch {
      return false;
    }
  }).map((entry) => ({ ...entry, song: { ...entry.song, offlineSourceKey: entry.song.offlineSourceKey ?? legacySourceKey } }));
  if (stored.some((entry) => isOfflineTrack(entry) && !entry.song.offlineSourceKey)) {
    await writePrivateJson(FILE_NAME, tracks, KEY);
  }
  return tracks;
}

export async function downloadTrack(song: Song, sourceUrl: string, onProgress?: (progress: number | undefined) => void): Promise<OfflineTrack> {
  if (Platform.OS === 'web') throw new Error('I download offline sono disponibili nell’app Android.');
  const current = await loadOfflineTracks();
  const key = downloadKey(song);
  const previous = current.find((entry) => downloadKey(entry.song) === key);
  const directory = new Directory(Paths.document, 'gio-music-offline');
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
  const extension = (song.suffix || 'mp3').replace(/[^a-z0-9]/gi, '');
  const stem = stableFileStem(key);
  const destination = new File(directory, `${stem}.${extension || 'audio'}`);
  const temporary = new File(directory, `${stem}.download`);
  const expectedSize = typeof song.size === 'number' && song.size > 0 ? song.size : 0;
  if (expectedSize && Paths.availableDiskSpace < expectedSize + 64 * 1024 * 1024) {
    throw new Error('Spazio insufficiente per scaricare il brano mantenendo un margine di sicurezza.');
  }
  if (temporary.exists) temporary.delete();
  try {
    const request = createDownloadResumable(sourceUrl, temporary.uri, {}, (event) => {
      onProgress?.(event.totalBytesExpectedToWrite > 0
        ? Math.min(1, event.totalBytesWritten / event.totalBytesExpectedToWrite)
        : undefined);
    });
    const result = await request.downloadAsync();
    if (!result || result.status < 200 || result.status >= 300) throw new Error('Download non riuscito. Riprova.');
    const contentType = Object.entries(result.headers ?? {}).find(([name]) => name.toLowerCase() === 'content-type')?.[1] ?? '';
    if (/json|text\/html|text\/xml/i.test(contentType)) throw new Error('Il server non ha restituito un file audio.');
    if (!temporary.exists || temporary.size <= 0 || (expectedSize && temporary.size !== expectedSize)) {
      throw new Error('Il download non è completo: dimensione del file non valida.');
    }
    await temporary.move(destination, { overwrite: true });
  } catch (error) {
    if (temporary.exists) temporary.delete();
    throw error;
  }
  const track: OfflineTrack = {
    song,
    localUri: destination.uri,
    downloadedAt: Date.now(),
    size: destination.size,
  };
  const next = [track, ...current.filter((entry) => downloadKey(entry.song) !== key)];
  try {
    await writePrivateJson(FILE_NAME, next, KEY);
  } catch (error) {
    if (previous?.localUri !== destination.uri && destination.exists) destination.delete();
    throw error;
  }
  return track;
}

export async function removeOfflineTrack(key: string): Promise<OfflineTrack[]> {
  const current = await loadOfflineTracks();
  const target = current.find((entry) => downloadKey(entry.song) === key);
  if (target) {
    const file = new File(target.localUri);
    if (file.exists) file.delete();
  }
  const next = current.filter((entry) => downloadKey(entry.song) !== key);
  await writePrivateJson(FILE_NAME, next, KEY);
  return next;
}

export async function clearOfflineTracks(): Promise<void> {
  if (Platform.OS !== 'web') {
    const directory = new Directory(Paths.document, 'gio-music-offline');
    if (directory.exists) directory.delete();
  }
  await deletePrivateJson(FILE_NAME, KEY);
}
