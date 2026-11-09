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

function webStore() {
  const compiled = ts.transpileModule(readFileSync(new URL('../src/storage/libraryStore.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const values = new Map<string, string>();
  const legacy = new Map<string, string>();
  const events: string[] = [];
  let abortWrite = false;
  const exports = {} as {
    saveLibrary(snapshot: LibrarySnapshot): Promise<LibrarySnapshot>;
    loadLibrary(): Promise<LibrarySnapshot | null>;
    loadLibraryPreview(): Promise<{ songCount: number } | null>;
    clearLibrary(): Promise<void>;
  };
  const db = {
    close() { events.push('close'); },
    transaction(_store: string, mode: string) {
      const tx: any = { error: new Error('Commit fallito') };
      const request = (result: unknown, commit = () => {}) => {
        const req: any = { result };
        setImmediate(() => {
          req.onsuccess();
          setImmediate(() => {
            if (mode === 'readwrite' && abortWrite) tx.onabort();
            else { commit(); events.push('commit'); tx.oncomplete(); }
          });
        });
        return req;
      };
      tx.objectStore = () => ({
        put: (value: string, key: string) => request(key, () => { values.set(key, value); }),
        get: (key: string) => request(values.get(key)),
        delete: (key: string) => request(undefined, () => { values.delete(key); }),
      });
      return tx;
    },
  };
  vm.runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === 'react-native') return { Platform: { OS: 'web' } };
      if (name === 'expo-file-system') return {};
      if (name.includes('NavidromeClient')) return { cleanGenres: (genres: unknown) => genres };
      if (name.includes('backgroundWork')) return { yieldToEvents };
      if (name.includes('async-storage')) return { __esModule: true, default: {
        getItem: async (key: string) => legacy.get(key) ?? null,
        setItem: async () => { throw new Error('Non usare localStorage per la libreria'); },
        removeMany: async (keys: string[]) => {
          events.push('remove-legacy');
          keys.forEach((key) => legacy.delete(key));
        },
      } };
      throw new Error(`Import inatteso: ${name}`);
    },
    indexedDB: {
      open: () => {
        const req: any = { result: db };
        setImmediate(() => req.onsuccess());
        return req;
      },
    },
  });
  return { ...exports, values, legacy, events, abort: () => { abortWrite = true; } };
}

const webSnapshot: LibrarySnapshot = {
  albums: [{ id: 'album', name: 'Album', artist: 'Artist', coverUrl: 'cover-from-album' }], artists: [], genres: [],
  playlists: [], radios: [], syncedAt: 42,
  songs: [{ id: 'song', title: 'Track', albumId: 'album', coverUrl: 'old-cover' }],
};

test('desktop salva in IndexedDB e restituisce la libreria normalizzata dopo il commit', async () => {
  const store = webStore();
  const saved = await store.saveLibrary(webSnapshot);
  assert.equal(saved.songs[0].coverUrl, 'cover-from-album');
  assert.equal(saved.syncedAt, 42);
  const persisted = JSON.parse(store.values.get('gio-music.library.v3')!);
  assert.equal('coverUrl' in persisted.songs[0], false);
  assert.deepEqual(store.events, ['commit', 'close', 'remove-legacy']);
  assert.equal((await store.loadLibrary())?.songs[0].coverUrl, 'cover-from-album');
  assert.equal((await store.loadLibraryPreview())?.songCount, 1);
});

test('desktop migra la cache legacy con removeMany e cancella entrambe le cache', async () => {
  const store = webStore();
  store.legacy.set('gio-music.library.v2', JSON.stringify(webSnapshot));
  assert.equal((await store.loadLibrary())?.songs[0].coverUrl, 'cover-from-album');
  assert.equal(store.legacy.size, 0);
  assert.equal(store.values.size, 1);
  await store.clearLibrary();
  assert.equal(store.values.size, 0);
  assert.equal(await store.loadLibrary(), null);
});

test('desktop conserva la cache legacy se la transazione IndexedDB fallisce', async () => {
  const store = webStore();
  store.legacy.set('gio-music.library.v3', JSON.stringify(webSnapshot));
  store.abort();
  await assert.rejects(store.saveLibrary(webSnapshot), /Commit fallito/);
  assert.equal(store.values.size, 0);
  assert.equal(store.legacy.size, 1);
  assert.deepEqual(store.events, ['close']);
});
