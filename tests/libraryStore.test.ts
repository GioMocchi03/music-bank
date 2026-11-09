import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import type { LibrarySnapshot } from '../src/storage/libraryStore.ts';
import { yieldToEvents } from '../src/utils/backgroundWork.ts';

function reader(chunks: string[]) {
  const source = ts.createSourceFile('libraryStore.ts', readFileSync(new URL('../src/storage/libraryStore.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'readGeneration')!;
  const compiled = ts.transpileModule(`${declaration.getText(source)}\nexport { readGeneration };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const events: string[] = [];
  const exports = {} as { readGeneration(root: object, manifest: object): Promise<LibrarySnapshot> };
  vm.runInNewContext(compiled, {
    exports,
    Directory: class {},
    File: class {
      index: number;
      constructor(_root: object, name: string) { this.index = Number(name.match(/songs-(\d+)/)![1]); }
      get exists() { return this.index < chunks.length; }
      async text() { events.push(`read-${this.index}`); return chunks[this.index]; }
    },
    readGenerationMetadata: async () => ({
      albums: [{ id: 'album', coverUrl: 'cover-from-album' }],
      artists: [], genres: [], playlists: [], radios: [], syncedAt: 42, songCount: 3,
    }),
    yieldToEvents: async () => { events.push('yield'); await yieldToEvents(); },
  });
  return { read: (songs: number, songChunks = chunks.length) => exports.readGeneration({}, { generation: 'g', songs, songChunks }), events };
}

test('ripristina copertine e ordine per blocco cedendo il thread tra le letture', async () => {
  const r = reader([
    JSON.stringify([{ id: '1', title: 'A', albumId: 'album', coverUrl: 'old' }]),
    JSON.stringify([{ id: '2', title: 'B', albumId: 'missing', coverUrl: 'fallback' }, { id: '3', title: 'C' }]),
  ]);
  const snapshot = await r.read(3);
  assert.deepEqual(r.events, ['yield', 'read-0', 'yield', 'read-1']);
  assert.deepEqual(Array.from(snapshot.songs, (song) => song.id), ['1', '2', '3']);
  assert.equal(snapshot.songs[0].coverUrl, 'cover-from-album');
  assert.equal(snapshot.songs[1].coverUrl, 'fallback');
  assert.equal(snapshot.syncedAt, 42);
  assert.equal('songCount' in snapshot, false);
});

test('conserva i controlli contro chunk mancanti, corrotti e conteggi errati', async () => {
  await assert.rejects(reader([]).read(1, 1), /assente/);
  await assert.rejects(reader(['{}']).read(1), /non valido/);
  await assert.rejects(reader(['broken']).read(1), /JSON/);
  await assert.rejects(reader(['[]']).read(1), /Verifica della libreria/);
  const empty = await reader([]).read(0);
  assert.equal(empty.songs.length, 0);
});
