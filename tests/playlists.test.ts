import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isAlbumFolderPlaylist,
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
  const personalIds = new Set(['mine', 'case']);
  const result = partitionPlaylists([
    { id: 'mine', name: 'Mia', owner: 'Gio' },
    { id: 'shared', name: 'Condivisa', owner: 'admin' },
    { id: 'imported', name: 'Importata' },
    { id: 'case', name: 'Maiuscole', owner: 'GIO' },
  ], 'gio', personalIds);

  assert.deepEqual(result.owned.map(({ id }) => id), ['mine', 'case']);
  assert.deepEqual(result.server.map(({ id }) => id), ['shared', 'imported']);
});

test('non considera personale una raccolta del server soltanto perché ha lo stesso owner', () => {
  const result = partitionPlaylists([
    { id: 'folder', name: 'Cartella album', owner: 'gio' },
    { id: 'created-in-app', name: 'Mia playlist', owner: 'gio' },
  ], 'gio', new Set(['created-in-app']));

  assert.deepEqual(result.owned.map(({ id }) => id), ['created-in-app']);
  assert.deepEqual(result.server.map(({ id }) => id), ['folder']);
});

test('riconosce le cartelle che duplicano un album completo', () => {
  const albums = [
    { id: 'album-1', name: 'Album Uno', artist: 'Artista', songCount: 2 },
  ];
  assert.equal(isAlbumFolderPlaylist(
    { id: 'same-name', name: 'Álbum Uno', songCount: 2 },
    albums,
  ), true);
  assert.equal(isAlbumFolderPlaylist(
    { id: 'folder', name: 'Artista/Album Uno', songCount: 2 },
    albums,
    [
      { id: 's1', title: 'Uno', albumId: 'album-1' },
      { id: 's2', title: 'Due', albumId: 'album-1' },
    ],
  ), true);
  assert.equal(isAlbumFolderPlaylist(
    { id: 'real', name: 'Tekno - Sal compilation', songCount: 2 },
    albums,
    [
      { id: 's1', title: 'Uno', albumId: 'album-1' },
      { id: 's3', title: 'Tre', albumId: 'album-2' },
    ],
  ), false);
  assert.equal(isAlbumFolderPlaylist(
    { id: 'single-album-playlist', name: 'Preferiti della settimana', songCount: 2 },
    albums,
    [
      { id: 's1', title: 'Uno', albumId: 'album-1' },
      { id: 's2', title: 'Due', albumId: 'album-1' },
    ],
  ), false);
});
