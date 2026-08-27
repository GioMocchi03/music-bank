import type { Album, Playlist, Song } from '../subsonic/NavidromeClient';

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

export function isPlaylistOwnedBy(
  playlist: Playlist,
  username: string,
  personalPlaylistIds?: ReadonlySet<string>,
): boolean {
  const owner = playlist.owner?.trim().toLocaleLowerCase();
  const currentUser = username.trim().toLocaleLowerCase();
  return !!owner
    && !!currentUser
    && owner === currentUser
    && (!personalPlaylistIds || personalPlaylistIds.has(playlist.id));
}

function normalizedCollectionName(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isAlbumFolderPlaylist(
  playlist: Playlist,
  albums: Album[],
  entries: Song[] = playlist.entry ?? [],
): boolean {
  const playlistName = normalizedCollectionName(playlist.name);
  const sameNameAlbums = albums.filter((album) => normalizedCollectionName(album.name) === playlistName);
  if (sameNameAlbums.some((album) => (
    !playlist.songCount
    || !album.songCount
    || Number(playlist.songCount) === Number(album.songCount)
  ))) return true;

  if (!entries.length) return false;
  const albumIds = new Set(entries.map((song) => song.albumId).filter((id): id is string => !!id));
  if (albumIds.size !== 1) return false;
  const [albumId] = albumIds;
  const album = albums.find((candidate) => candidate.id === albumId);
  if (!album) return false;
  const expectedCount = Number(album.songCount ?? 0);
  const albumName = normalizedCollectionName(album.name);
  const nameLooksLikeAlbum = albumName.length >= 4
    && (playlistName.includes(albumName) || albumName.includes(playlistName));
  return expectedCount > 0 && entries.length === expectedCount && nameLooksLikeAlbum;
}

export function partitionPlaylists(
  playlists: Playlist[],
  username: string,
  personalPlaylistIds: ReadonlySet<string> = new Set(),
): {
  owned: Playlist[];
  server: Playlist[];
} {
  const owned: Playlist[] = [];
  const server: Playlist[] = [];
  playlists.forEach((playlist) => {
    (isPlaylistOwnedBy(playlist, username, personalPlaylistIds) ? owned : server).push(playlist);
  });
  return { owned, server };
}

export function movePlaylistItem<Item>(items: Item[], index: number, direction: -1 | 1): Item[] {
  const destination = index + direction;
  if (index < 0 || index >= items.length || destination < 0 || destination >= items.length) return items;
  const next = [...items];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}

export function removePlaylistItem<Item>(items: Item[], index: number): Item[] {
  return index < 0 || index >= items.length ? items : items.filter((_, itemIndex) => itemIndex !== index);
}
