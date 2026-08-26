import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseFeaturedAlbum, featuredArtistKey } from '../src/utils/homeFeatured.ts';
import type { Album } from '../src/subsonic/NavidromeClient.ts';

const albums: Album[] = Array.from({ length: 7 }, (_, i) => ({
  id: `album-${i}`, name: `Album ${i}`, artist: `Artist ${i}`, artistId: `artist-${i}`, playCount: 70 - i * 10,
}));

test('sceglie tra i cinque artisti più ascoltati senza ripetere il precedente', () => {
  for (const random of [0, 0.25, 0.5, 0.99]) {
    const picked = chooseFeaturedAlbum(albums, [], [], featuredArtistKey(albums[0]), albums[0].id, () => random)!;
    assert.ok(albums.slice(1, 5).some((album) => album.id === picked.id));
  }
});

test('usa gli ascolti locali se il server non fornisce conteggi', () => {
  const catalog = albums.map(({ playCount: _, ...album }) => album);
  const history = [{ song: { id: 'song', title: 'Track', albumId: 'album-6' }, playedAt: 100, playCount: 4 }];
  assert.equal(chooseFeaturedAlbum(catalog, [], history, undefined, undefined, () => 0)?.id, 'album-6');
});

test('non somma due volte il conteggio server e locale dello stesso brano', () => {
  const catalog = albums.slice(0, 2).map(({ playCount: _, ...album }) => album);
  const songs = [
    { id: 's0', title: 'A', albumId: 'album-0', playCount: 10 },
    { id: 's1', title: 'B', albumId: 'album-1', playCount: 15 },
  ];
  const history = [{ song: songs[0], playedAt: 10, playCount: 10 }];
  assert.equal(chooseFeaturedAlbum(catalog, songs, history, undefined, undefined, () => 0)?.id, 'album-1');
});

test('con un solo artista alterna gli album se disponibili', () => {
  const catalog = [albums[0], { ...albums[0], id: 'another-album' }];
  assert.equal(chooseFeaturedAlbum(catalog, [], [], featuredArtistKey(albums[0]), albums[0].id, () => 0)?.id, 'another-album');
});

test('gestisce libreria vuota, unico album e assenza di cronologia', () => {
  assert.equal(chooseFeaturedAlbum([], [], []), undefined);
  assert.equal(chooseFeaturedAlbum([albums[0]], [], [], featuredArtistKey(albums[0]), albums[0].id)?.id, albums[0].id);
  const catalog = albums.map(({ playCount: _, ...album }) => album);
  assert.equal(chooseFeaturedAlbum(catalog, [], [], featuredArtistKey(albums[0]), albums[0].id, () => 0)?.id, 'album-1');
});
