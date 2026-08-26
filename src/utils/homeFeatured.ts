import type { Album, Song } from '../subsonic/NavidromeClient.ts';
import type { HistoryEntry } from '../storage/historyStore.ts';
import { normalizeSearchText } from './search.ts';

export function featuredArtistKey(album: Album): string {
  return album.artistId ? `id:${album.artistId}` : `name:${normalizeSearchText(album.artist)}`;
}

export function chooseFeaturedAlbum(
  albums: Album[],
  songs: Song[],
  history: HistoryEntry[],
  previousArtist?: string,
  previousAlbum?: string,
  random = Math.random,
): Album | undefined {
  const groups = new Map<string, { albums: Album[]; plays: number; lastPlayedAt: number }>();
  const albumKeys = new Map<string, string>();
  const artistNames = new Map<string, string>();
  for (const album of albums) {
    const key = featuredArtistKey(album);
    const group = groups.get(key) ?? { albums: [], plays: 0, lastPlayedAt: 0 };
    group.albums.push(album);
    groups.set(key, group);
    albumKeys.set(album.id, key);
    artistNames.set(normalizeSearchText(album.artist), key);
  }
  // I conteggi del server e quelli locali dello stesso brano non vanno sommati due volte.
  const playsBySong = new Map<string, { song: Song; plays: number; lastPlayedAt: number }>();
  for (const song of songs) {
    playsBySong.set(song.id, { song, plays: Math.max(0, song.playCount ?? 0), lastPlayedAt: 0 });
  }
  for (const entry of history) {
    const previous = playsBySong.get(entry.song.id);
    playsBySong.set(entry.song.id, {
      song: previous?.song ?? entry.song,
      plays: Math.max(previous?.plays ?? 0, entry.playCount ?? 1),
      lastPlayedAt: Math.max(previous?.lastPlayedAt ?? 0, entry.playedAt),
    });
  }
  for (const { song, plays, lastPlayedAt } of playsBySong.values()) {
    const key = (song.albumId ? albumKeys.get(song.albumId) : undefined)
      ?? (song.artistId && groups.has(`id:${song.artistId}`) ? `id:${song.artistId}` : undefined)
      ?? artistNames.get(normalizeSearchText(song.artist ?? ''));
    const group = key ? groups.get(key) : undefined;
    if (!group) continue;
    group.plays += plays;
    group.lastPlayedAt = Math.max(group.lastPlayedAt, lastPlayedAt);
  }
  const ranked = [...groups.entries()].map(([key, group]) => ({
    key,
    ...group,
    plays: Math.max(group.plays, group.albums.reduce((sum, album) => sum + Math.max(0, album.playCount ?? 0), 0)),
  })).sort((a, b) => b.plays - a.plays || b.lastPlayedAt - a.lastPlayedAt || a.key.localeCompare(b.key));
  const listened = ranked.filter((group) => group.plays > 0).slice(0, 5);
  const pool = listened.length ? listened : ranked;
  const alternatives = pool.filter((group) => group.key !== previousArtist);
  const candidates = alternatives.length ? alternatives : pool;
  if (!candidates.length) return undefined;
  const artist = candidates[Math.floor(random() * candidates.length)];
  const otherAlbums = artist.albums.filter((album) => album.id !== previousAlbum);
  const albumPool = otherAlbums.length ? otherAlbums : artist.albums;
  return albumPool[Math.floor(random() * albumPool.length)];
}
