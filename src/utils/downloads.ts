import type { NavidromeConnection, Song } from '../subsonic/NavidromeClient.ts';
import { normalizeServerUrl } from './connection.ts';

export type DownloadJob = {
  song: Song;
  status: 'queued' | 'downloading' | 'removing' | 'error';
  progress?: number;
  error?: string;
};

export function connectionSourceKey(connection: NavidromeConnection): string {
  return JSON.stringify([normalizeServerUrl(connection.serverUrl), connection.username.trim()]);
}

export function downloadKey(song: Song, activeSourceKey = 'legacy'): string {
  return JSON.stringify([song.offlineSourceKey ?? activeSourceKey, song.id]);
}

export function songBelongsToSource(song: Song, activeSourceKey: string): boolean {
  return activeSourceKey !== 'legacy' && (!song.offlineSourceKey || song.offlineSourceKey === activeSourceKey);
}

export function downloadJobLabel(job: DownloadJob): string {
  if (job.status === 'queued') return 'In coda';
  if (job.status === 'removing') return 'Rimozione…';
  if (job.status === 'error') return 'Errore · Riprova';
  return job.progress === undefined ? 'Scaricamento…' : `Scaricamento ${Math.round(job.progress * 100)}%`;
}

export function formatDownloadSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// Una sola scrittura/download alla volta protegge l'indice e impedisce doppi tap.
export class DownloadQueue {
  private tail: Promise<void> = Promise.resolve();
  private keys = new Set<string>();
  get busy(): boolean { return this.keys.size > 0; }
  enqueue(key: string, task: () => Promise<void>): Promise<void> | undefined {
    if (this.keys.has(key)) return undefined;
    this.keys.add(key);
    const result = this.tail.then(task).finally(() => { this.keys.delete(key); });
    this.tail = result.catch(() => {});
    return result;
  }
}
