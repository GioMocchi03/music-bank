import type { Song } from '../subsonic/NavidromeClient';
import { deletePrivateJson, readPrivateJson, writePrivateJson } from './privateJsonStore';

const KEY = 'gio-music.history.v1';
const FILE_NAME = 'music-bank-history-v1.json';
const MAX_ENTRIES = 100;

export type HistoryEntry = {
  song: Song;
  playedAt: number;
  playCount?: number;
};

export async function loadHistory(): Promise<HistoryEntry[]> {
  const stored = await readPrivateJson<unknown>(FILE_NAME, KEY);
  if (!Array.isArray(stored)) return [];
  return stored.filter((value): value is HistoryEntry => {
    if (!value || typeof value !== 'object') return false;
    const entry = value as Partial<HistoryEntry>;
    return typeof entry.playedAt === 'number'
      && !!entry.song
      && typeof entry.song.id === 'string'
      && typeof entry.song.title === 'string';
  }).slice(0, MAX_ENTRIES);
}

export async function rememberPlayed(song: Song): Promise<HistoryEntry[]> {
  const current = await loadHistory();
  const previous = current.find((entry) => entry.song.id === song.id);
  const next = [
    {
      song,
      playedAt: Date.now(),
      playCount: previous ? (previous.playCount ?? 1) + 1 : 1,
    },
    ...current.filter((entry) => entry.song.id !== song.id),
  ].slice(0, MAX_ENTRIES);
  await writePrivateJson(FILE_NAME, next, KEY);
  return next;
}

export async function clearHistory(): Promise<void> {
  await deletePrivateJson(FILE_NAME, KEY);
}
