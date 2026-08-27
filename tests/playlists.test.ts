import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizePlaylistName,
  movePlaylistItem,
  partitionPlaylists,
  removePlaylistItem,
  validatePlaylistName,
} from '../src/utils/playlists.ts';

test('normalizza il nome e rifiuta playlist vuote o troppo lunghe', () => {
  assert.equal(normalizePlaylistName('  Viaggio   estate  '), 'Viaggio estate');
  assert.equal(validatePlaylistName('   '), 'Inserisci un nome per la playlist.');
  assert.match(validatePlaylistName('x'.repeat(101)) ?? '', /100 caratteri/);
  assert.equal(validatePlaylistName('Preferiti personali'), null);
});

test('riordina e rimuove i brani senza modificare la lista originale', () => {
  const original = ['a', 'b', 'c'];
  assert.deepEqual(movePlaylistItem(original, 1, -1), ['b', 'a', 'c']);
  assert.deepEqual(movePlaylistItem(original, 1, 1), ['a', 'c', 'b']);
  assert.equal(movePlaylistItem(original, 0, -1), original);
  assert.deepEqual(removePlaylistItem(original, 1), ['a', 'c']);
  assert.deepEqual(original, ['a', 'b', 'c']);
});

test('separa le playlist dell’account da quelle del server o condivise', () => {
  const result = partitionPlaylists([
    { id: 'mine', name: 'Mia', owner: 'Gio' },
    { id: 'shared', name: 'Condivisa', owner: 'admin' },
    { id: 'imported', name: 'Importata' },
    { id: 'case', name: 'Maiuscole', owner: 'GIO' },
  ], 'gio');

  assert.deepEqual(result.owned.map(({ id }) => id), ['mine', 'case']);
  assert.deepEqual(result.server.map(({ id }) => id), ['shared', 'imported']);
});
