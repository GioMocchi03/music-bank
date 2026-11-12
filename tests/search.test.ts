import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasAlbums,
  levenshteinDistance,
  normalizeSearchText,
  rankDirectSearchItems,
  rankSearchItems,
  rankSearchItemsInSlices,
} from '../src/utils/search.ts';

const catalog = [
  { item: { id: 'enterloop' }, text: normalizeSearchText("L'Enterloop Enterloop") },
  { item: { id: 'interpol' }, text: normalizeSearchText('Interpol Antics') },
];

test('normalizza apostrofi, accenti e separatori', () => {
  assert.equal(normalizeSearchText('L’Ènter-loop'), 'l enter loop');
});

test('trova L’Enterloop anche cercando enterloop senza articolo', () => {
  assert.deepEqual(rankDirectSearchItems(catalog, 'enterloop', 10), [{ id: 'enterloop' }]);
});

test('tollera un piccolo errore di battitura quando non ci sono risultati diretti', () => {
  assert.deepEqual(rankSearchItems(catalog, 'enterlop', 10), [{ id: 'enterloop' }]);
});

test('interrompe il calcolo Levenshtein oltre la soglia configurata', () => {
  assert.equal(levenshteinDistance('enterloop', 'completely', 2), 3);
});

test('la ricerca a blocchi conserva ranking, stabilità e limiti', async () => {
  const entries = Array.from({ length: 650 }, (_, id) => ({
    item: { id }, text: normalizeSearchText(['Jazz', 'Jazz Club', 'My Jazz', 'Ja zz', 'Other'][id % 5]),
  }));
  for (const query of ['jazz', 'jaz', 'jzz', 'missing', '']) {
    for (const limit of [0, 1, 25, 100]) {
      assert.deepEqual(
        await rankSearchItemsInSlices(entries, query, limit, new AbortController().signal),
        rankDirectSearchItems(entries, query, limit),
      );
      assert.deepEqual(
        await rankSearchItemsInSlices(entries, query, limit, new AbortController().signal, true),
        rankSearchItems(entries, query, limit),
      );
    }
  }
});

test('uscire dalla ricerca annulla anche un filtro locale ancora in corso', async () => {
  const controller = new AbortController();
  const entries = Array.from({ length: 10_000 }, (_, item) => ({ item, text: 'jazz' }));
  const pending = rankSearchItemsInSlices(entries, 'jazz', 100, controller.signal);
  setTimeout(() => controller.abort(), 0);
  assert.equal(await pending, null);
});

test('esclude gli artisti senza album ma tiene quelli senza conteggio', () => {
  assert.equal(hasAlbums({ albumCount: 0 }), false);
  assert.equal(hasAlbums({ albumCount: '0' }), false);
  assert.equal(hasAlbums({ albumCount: 5 }), true);
  assert.equal(hasAlbums({}), true);
});
