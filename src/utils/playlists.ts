import type { Playlist } from '../subsonic/NavidromeClient';

export const PLAYLIST_NAME_MAX_LENGTH = 100;

export function normalizePlaylistName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function validatePlaylistName(value: string): string | null {
  const normalized = normalizePlaylistName(value);
  if (!normalized) return 'Inserisci un nome per la playlist.';
  if (normalized.length > PLAYLIST_NAME_MAX_LENGTH) {
    return `Usa al massimo ${PLAYLIST_NAME_MAX_LENGTH} caratteri.`;
  }
  return null;
}

export function isPlaylistOwnedBy(playlist: Playlist, username: string): boolean {
  const owner = playlist.owner?.trim().toLocaleLowerCase();
  const currentUser = username.trim().toLocaleLowerCase();
  return !!owner && !!currentUser && owner === currentUser;
}

export function partitionPlaylists(playlists: Playlist[], username: string): {
  owned: Playlist[];
  server: Playlist[];
} {
  const owned: Playlist[] = [];
  const server: Playlist[] = [];
  playlists.forEach((playlist) => {
    (isPlaylistOwnedBy(playlist, username) ? owned : server).push(playlist);
  });
  return { owned, server };
}
