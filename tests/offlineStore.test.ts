import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { downloadKey } from '../src/utils/downloads.ts';
import type { OfflineTrack } from '../src/storage/offlineStore.ts';
import type { Song } from '../src/subsonic/NavidromeClient.ts';

function createStore({ status = 200, size = 123, contentType = 'audio/mpeg', writeFails = false, downloadFails = false } = {}) {
  const files = new Map<string, number>();
  let records: OfflineTrack[] = [];
  class File {
    uri: string;
    constructor(root: string | { uri: string }, name?: string) { this.uri = (typeof root === 'string' ? root : root.uri) + (name ? '/' + name : ''); }
    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri) ?? 0; }
    delete() { files.delete(this.uri); }
    async move(destination: File) { files.set(destination.uri, this.size); files.delete(this.uri); }
  }
  class Directory extends File {
    get exists() { return true; }
    create() {}
    delete() { for (const path of files.keys()) if (path.startsWith(this.uri + '/')) files.delete(path); }
  }
  const modules: Record<string, unknown> = {
    'expo-file-system': { Directory, File, Paths: { document: 'file:///test', availableDiskSpace: 1024 ** 3 } },
    'react-native': { Platform: { OS: 'android' } },
    'expo-file-system/legacy': { createDownloadResumable: (_url: string, path: string, _options: unknown, progress: (event: unknown) => void) => ({
      downloadAsync: async () => {
        files.set(path, size);
        progress({ totalBytesWritten: size, totalBytesExpectedToWrite: size });
        if (downloadFails) throw new Error('Network failed');
        return { uri: path, status, headers: { 'Content-Type': contentType } };
      },
    }) },
    '../utils/downloads': { downloadKey },
    './privateJsonStore': {
      readPrivateJson: async () => structuredClone(records),
      writePrivateJson: async (_name: string, value: OfflineTrack[]) => { if (writeFails) throw new Error('Disk full'); records = structuredClone(value); },
      deletePrivateJson: async () => { records = []; },
    },
  };
  const compiled = ts.transpileModule(readFileSync(new URL('../src/storage/offlineStore.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {} as {
    downloadTrack: (song: Song, url: string, progress?: (n: number | undefined) => void) => Promise<OfflineTrack>;
    loadOfflineTracks: () => Promise<OfflineTrack[]>;
    removeOfflineTrack: (key: string) => Promise<OfflineTrack[]>;
    clearOfflineTracks: () => Promise<void>;
  };
  vm.runInNewContext(compiled, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  return { ...exports, files, records: () => records };
}

const song = { id: 'same-id', title: 'Track', size: 123, offlineSourceKey: 'server-A' };

test('indica come scaricato soltanto un file completo e persistito', async () => {
  const store = createStore();
  const progress: Array<number | undefined> = [];
  const track = await store.downloadTrack(song, 'https://music.example.org/audio', (n) => progress.push(n));
  assert.equal(track.size, 123);
  assert.equal((await store.loadOfflineTracks()).length, 1);
  assert.equal(progress.at(-1), 1);
  store.files.delete(track.localUri);
  assert.equal((await store.loadOfflineTracks()).length, 0);
});

for (const options of [{ size: 0 }, { size: 90 }, { status: 401 }, { contentType: 'application/json' }, { writeFails: true }, { downloadFails: true }]) {
  test(`download fallito senza icona verde né file parziali: ${JSON.stringify(options)}`, async () => {
    const store = createStore(options);
    await assert.rejects(store.downloadTrack(song, 'https://music.example.org/audio'));
    assert.equal(store.records().length, 0);
    assert.equal(store.files.size, 0);
  });
}

test('download e rimozione non confondono gli stessi ID di account diversi', async () => {
  const store = createStore();
  const one = await store.downloadTrack(song, 'https://music.example.org/audio');
  const otherSong = { ...song, offlineSourceKey: 'server-B' };
  const two = await store.downloadTrack(otherSong, 'https://music.example.org/audio');
  assert.notEqual(one.localUri, two.localUri);
  assert.equal(store.records().length, 2);
  await store.removeOfflineTrack(downloadKey(song));
  assert.equal(store.records()[0].song.offlineSourceKey, 'server-B');
  assert.equal(store.files.size, 1);
  await store.clearOfflineTracks();
  assert.equal(store.files.size, 0);
  assert.equal(store.records().length, 0);
});

test('al caricamento un file troncato non risulta disponibile offline', async () => {
  const store = createStore();
  const track = await store.downloadTrack(song, 'https://music.example.org/audio');
  store.files.set(track.localUri, 12);
  assert.equal((await store.loadOfflineTracks()).length, 0);
});
