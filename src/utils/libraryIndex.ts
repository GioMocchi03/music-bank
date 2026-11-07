import type { Album, Artist, Song } from '../subsonic/NavidromeClient';
import { forEachInSlices } from './backgroundWork.ts';
import { normalizeSearchText, type SearchEntry } from './search.ts';

export type LibraryIndex = {
  songsById: Map<string, Song>;
  favoriteSongs: Song[];
  years: number[];
  yearCounts: Map<number, number>;
  search: {
    albums: SearchEntry<Album>[];
    artists: SearchEntry<Artist>[];
    songs: SearchEntry<Song>[];
  };
};

export function emptyLibraryIndex(): LibraryIndex {
  return {
    songsById: new Map(), favoriteSongs: [], years: [], yearCounts: new Map(),
    search: { albums: [], artists: [], songs: [] },
  };
}

export async function prepareLibraryIndex(
  albums: Album[],
  artists: Artist[],
  songs: Song[],
  signal?: AbortSignal,
): Promise<LibraryIndex | null> {
  const index = emptyLibraryIndex();
  if (!await forEachInSlices(albums, (album) => {
    index.search.albums.push({
      item: album,
      text: normalizeSearchText(`${album.name} ${album.artist} ${album.genre ?? ''}`),
    });
    if (typeof album.year === 'number') {
      index.yearCounts.set(album.year, (index.yearCounts.get(album.year) ?? 0) + 1);
    }
  }, signal)) return null;
  index.years = [...index.yearCounts.keys()].sort((a, b) => b - a);
  if (!await forEachInSlices(artists, (artist) => {
    index.search.artists.push({ item: artist, text: normalizeSearchText(artist.name) });
  }, signal)) return null;
  if (!await forEachInSlices(songs, (song) => {
    index.songsById.set(song.id, song);
    if (song.starred) index.favoriteSongs.push(song);
    index.search.songs.push({
      item: song,
      text: normalizeSearchText(`${song.title} ${song.artist ?? ''} ${song.album ?? ''} ${song.genre ?? ''}`),
    });
  }, signal)) return null;
  return index;
}
