import assert from 'node:assert/strict';
import test from 'node:test';
import { forEachInSlices } from '../src/utils/backgroundWork.ts';
import { prepareLibraryIndex } from '../src/utils/libraryIndex.ts';
import type { Album, Artist, Song } from '../src/subsonic/NavidromeClient.ts';

test('cede il thread prima di lavorare e tra blocchi di una libreria grande', async () => {
  const items = Array.from({ length: 10_000 }, (_, i) => i);
  const seen: number[] = [];
  const controller = new AbortController();
  const work = forEachInSlices(items, (item) => seen.push(item), controller.signal);
  assert.equal(seen.length, 0);
  await new Promise<void>((resolve) => setTimeout(() => {
    assert.ok(seen.length > 0 && seen.length <= 200);
    controller.abort();
    resolve();
  }, 0));
  assert.equal(await work, false);
  assert.ok(seen.length <= 200);
  assert.deepEqual(seen, items.slice(0, seen.length));
});

test('il budget temporale limita il lavoro anche prima dei 200 elementi', async (t) => {
  let clock = 0;
  t.mock.method(performance, 'now', () => { clock += 2; return clock; });
  const controller = new AbortController();
  let visited = 0;
  const work = forEachInSlices(Array(500).fill(0), () => { visited++; }, controller.signal);
  await new Promise<void>((resolve) => setTimeout(() => {
    assert.equal(visited, 2);
    controller.abort();
    resolve();
  }, 0));
  assert.equal(await work, false);
});

test('prepara ricerca, preferiti, anni e lookup senza modificare la libreria', async () => {
  const albums: Album[] = [
    { id: 'a', name: 'Città', artist: 'Artista', year: 2001 },
    { id: 'b', name: 'Altro', artist: 'Artista', year: 2024 },
    { id: 'c', name: 'Terzo', artist: 'Artista', year: 2001 },
    { id: 'd', name: 'Senza anno', artist: 'Altro' },
  ];
  const artists: Artist[] = [{ id: 'r', name: 'L’Artista' }];
  const songs: Song[] = [
    { id: 's1', title: 'È un brano', artist: 'L’Artista', album: 'Città', genre: 'Jazz', starred: 'yes' },
    { id: 's2', title: 'Secondo' },
  ];
  const before = JSON.stringify({ albums, artists, songs });
  const index = (await prepareLibraryIndex(albums, artists, songs))!;
  assert.equal(index.songsById.get('s1'), songs[0]);
  assert.deepEqual(index.favoriteSongs, [songs[0]]);
  assert.deepEqual(index.years, [2024, 2001]);
  assert.deepEqual([...index.yearCounts], [[2001, 2], [2024, 1]]);
  assert.equal(index.search.albums[0].text, 'citta artista');
  assert.equal(index.search.artists[0].text, 'l artista');
  assert.equal(index.search.songs[0].text, 'e un brano l artista citta jazz');
  assert.equal(index.search.songs[0].item, songs[0]);
  assert.equal(JSON.stringify({ albums, artists, songs }), before);
});

test('annulla indici obsoleti e ricostruisce preferiti e risultati dopo un aggiornamento', async () => {
  const controller = new AbortController();
  controller.abort();
  assert.equal(await prepareLibraryIndex([], [], [{ id: 'old', title: 'Vecchio' }], controller.signal), null);
  const old = (await prepareLibraryIndex([], [], [{ id: 'old', title: 'Vecchio', starred: 'yes' }]))!;
  const fresh = (await prepareLibraryIndex([], [], [{ id: 'new', title: 'Nuovo' }]))!;
  assert.equal(fresh.songsById.has('old'), false);
  assert.deepEqual(fresh.favoriteSongs, []);
  assert.equal(fresh.search.songs[0].text, 'nuovo');
  assert.equal(old.favoriteSongs.length, 1);
  const empty = (await prepareLibraryIndex([], [], []))!;
  assert.equal(empty.songsById.size, 0);
  assert.deepEqual(empty.years, []);
});
