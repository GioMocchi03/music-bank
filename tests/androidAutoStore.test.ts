import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import type { Song, NavidromeClient, Album, Artist, Genre } from '../src/subsonic/NavidromeClient.ts';

function store(os = 'android') {
  const files = new Map<string, string>();
  let notifications = 0;
  let failMove = false;
  class File {
    uri: string;
    constructor(root: string, name: string) { this.uri = `${root}/${name}`; }
    get exists() { return files.has(this.uri); }
    create() { files.set(this.uri, ''); }
    write(value: string) { files.set(this.uri, value); }
    async text() { return files.get(this.uri)!; }
    delete() { files.delete(this.uri); }
    async move(to: File, options: { overwrite?: boolean }) {
      assert.equal(options.overwrite, true);
      if (failMove) throw new Error('disk failure');
      const text = files.get(this.uri)!;
      files.delete(this.uri);
      files.set(to.uri, text);
      this.uri = to.uri;
    }
  }
  const modules: Record<string, unknown> = {
    'react-native': { Platform: { OS: os } },
    'expo-file-system': { File, Paths: { document: 'private' } },
    '../native/androidAuto': { refreshAndroidAutoCatalog: async () => { notifications++; } },
  };
  const compiled = ts.transpileModule(readFileSync(new URL('../src/storage/androidAutoStore.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {} as {
    ensureAndroidAutoCatalog(songs: Song[], client: NavidromeClient): Promise<void>;
    saveAndroidAutoCatalog(songs: Song[], client: NavidromeClient, metadata?: { albums: Album[]; artists: Artist[]; genres: Genre[] }): Promise<void>;
    updateAndroidAutoFavorite(songId: string, starred?: string): Promise<void>;
    clearAndroidAutoCatalog(): Promise<void>;
  };
  vm.runInNewContext(compiled, { exports, Date, require: (name: string) => {
    assert.ok(name in modules, name); return modules[name];
  } });
  return { ...exports, files, notifications: () => notifications, failMove: () => { failMove = true; } };
}
const song: Song = { id: 'one', title: 'Original', album: 'Album', artist: 'Artist', genre: 'Jazz' };
const client = { streamUrl: async (id: string) => `https://example.test/${id}?token=updated` } as NavidromeClient;
const path = 'private/music-bank-auto-catalog.json';

test('existing catalogue updates metadata and credentials with unchanged song count', async () => {
  const s = store();
  s.files.set(path, '{"songs":[{"id":"one","title":"Old"}]}');
  await s.ensureAndroidAutoCatalog([song], client);
  const result = JSON.parse(s.files.get(path)!);
  assert.equal(result.songs[0].title, 'Original');
  assert.match(result.songs[0].streamUrl, /token=updated/);
  assert.equal(s.notifications(), 1);
  assert.equal(s.files.size, 1);
});

test('empty library replaces stale songs', async () => {
  const s = store();
  await s.saveAndroidAutoCatalog([song], client);
  await s.ensureAndroidAutoCatalog([], client);
  assert.deepEqual(JSON.parse(s.files.get(path)!).songs, []);
});

test('network and move failures preserve the last usable catalogue', async () => {
  const s = store();
  s.files.set(path, 'old');
  await assert.rejects(s.saveAndroidAutoCatalog([song], { streamUrl: async () => { throw new Error('offline'); } } as unknown as NavidromeClient));
  assert.equal(s.files.get(path), 'old');
  s.failMove();
  await assert.rejects(s.saveAndroidAutoCatalog([song], client));
  assert.equal(s.files.get(path), 'old');
  assert.equal(s.files.size, 1);
  assert.equal(s.notifications(), 0);
});

test('logout waits for pending writer and later saves recover after failure', async () => {
  const s = store();
  const saving = s.saveAndroidAutoCatalog([song], client);
  const clearing = s.clearAndroidAutoCatalog();
  await Promise.all([saving, clearing]);
  assert.equal(s.files.size, 0);
  await assert.rejects(s.saveAndroidAutoCatalog([song], { streamUrl: async () => { throw new Error('offline'); } } as unknown as NavidromeClient));
  await s.saveAndroidAutoCatalog([song], client);
  assert.equal(JSON.parse(s.files.get(path)!).songs.length, 1);
});

test('other platforms never write or notify Android', async () => {
  const s = store('ios');
  await s.ensureAndroidAutoCatalog([song], client);
  await s.clearAndroidAutoCatalog();
  assert.equal(s.files.size, 0);
  assert.equal(s.notifications(), 0);
});

test('catalogue carries exact phone entities and initial favorite flags', async () => {
  const s = store();
  const metadata = { albums: [{ id: 'a', name: 'Album', artist: 'Artist' }], artists: [{ id: 'r', name: 'Artist' }], genres: [{ value: 'Hip-Hop', songCount: 1, albumCount: 1, sourceValues: ['Hip Hop'] }] };
  await s.saveAndroidAutoCatalog([{ ...song, starred: 'yes' }], client, metadata);
  const catalog = JSON.parse(s.files.get(path)!);
  assert.deepEqual(catalog.albums, metadata.albums);
  assert.deepEqual(catalog.artists, metadata.artists);
  assert.deepEqual(catalog.genres, metadata.genres);
  assert.equal(catalog.songs[0].starred, 'yes');
});

test('favorite edits follow pending saves and preserve stream URLs and metadata', async () => {
  const s = store();
  const saving = s.saveAndroidAutoCatalog([song], client);
  const starring = s.updateAndroidAutoFavorite(song.id, 'now');
  await Promise.all([saving, starring]);
  const starred = JSON.parse(s.files.get(path)!);
  assert.equal(starred.songs[0].starred, 'now');
  assert.match(starred.songs[0].streamUrl, /token=updated/);
  await s.updateAndroidAutoFavorite(song.id);
  assert.equal(JSON.parse(s.files.get(path)!).songs[0].starred, undefined);
  assert.equal(s.notifications(), 3);
  assert.equal(s.files.size, 1);
});

test('failed favorite write retains the usable catalogue and recovers', async () => {
  const s = store();
  await s.saveAndroidAutoCatalog([song], client);
  const previous = s.files.get(path);
  s.failMove();
  await assert.rejects(s.updateAndroidAutoFavorite(song.id, 'now'));
  assert.equal(s.files.get(path), previous);
  assert.equal(s.files.size, 1);
});
