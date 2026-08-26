import assert from 'node:assert/strict';
import test from 'node:test';

import {
  levenshteinDistance,
  normalizeSearchText,
  rankDirectSearchItems,
  rankSearchItems,
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
