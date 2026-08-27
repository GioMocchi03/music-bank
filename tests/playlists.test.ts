import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizePlaylistName,
  partitionPlaylists,
  validatePlaylistName,
} from '../src/utils/playlists.ts';

test('normalizza il nome e rifiuta playlist vuote o troppo lunghe', () => {
  assert.equal(normalizePlaylistName('  Viaggio   estate  '), 'Viaggio estate');
  assert.equal(validatePlaylistName('   '), 'Inserisci un nome per la playlist.');
  assert.match(validatePlaylistName('x'.repeat(101)) ?? '', /100 caratteri/);
  assert.equal(validatePlaylistName('Preferiti personali'), null);
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
