import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { normalizeServerUrl } from '../src/utils/connection.ts';

const key = 'gio-music.navidrome.connection';
const credentials = JSON.stringify({ serverUrl: 'https://music.example.org', username: 'Anna', password: 'test-only' });

// Esegue il vero store con adapter in memoria, senza moduli nativi o credenziali reali.
function createStore(os: 'android' | 'ios' | 'web', fail?: 'legacy' | 'secure') {
  const local = new Map([[key, credentials]]);
  const secure = new Map([[key, credentials]]);
  const files = new Map([['music-bank-connection.json', credentials]]);
  let nativeValue: string | null = credentials;
  class File {
    name: string;
    constructor(_root: unknown, name: string) { this.name = name; }
    get exists() { return files.has(this.name); }
    async text() { return files.get(this.name) ?? ''; }
    delete() { files.delete(this.name); }
  }
  const modules: Record<string, unknown> = {
    '@react-native-async-storage/async-storage': {
      getItem: async (name: string) => local.get(name) ?? null,
      setItem: async (name: string, value: string) => { local.set(name, value); },
      removeItem: async (name: string) => { local.delete(name); },
    },
    'expo-secure-store': {
      getItemAsync: async (name: string) => secure.get(name) ?? null,
      setItemAsync: async (name: string, value: string) => { secure.set(name, value); },
      deleteItemAsync: async (name: string) => {
        if (fail === 'secure') throw new Error('SecureStore unavailable');
        secure.delete(name);
      },
    },
    'expo-file-system': { File, Paths: { document: '/test' } },
    'react-native': { Platform: { OS: os } },
    '../../modules/gio-equalizer/src/GioConnectionStoreModule': {
      load: () => nativeValue,
      clear: () => {
        if (fail === 'legacy') return false;
        nativeValue = null;
        return true;
      },
    },
    '../utils/connection': { normalizeServerUrl },
  };
  const source = readFileSync(new URL('../src/storage/connectionStore.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {} as {
    clearConnection: () => Promise<void>;
    loadConnection: () => Promise<unknown>;
    saveConnection: (value: unknown) => Promise<void>;
  };
  vm.runInNewContext(compiled, { exports, require: (name: string) => {
    assert.ok(name in modules, `Modulo inatteso: ${name}`);
    return modules[name];
  } });
  return { ...exports, local, secure, files, native: () => nativeValue };
}

for (const os of ['android', 'ios', 'web'] as const) {
  test(`logout ${os}: il server non viene ripristinato al successivo caricamento`, async () => {
    const store = createStore(os);
    await store.clearConnection();
    assert.equal(await store.loadConnection(), null);
    assert.equal(store.local.has(key), false);
    if (os !== 'web') {
      assert.equal(store.secure.has(key), false);
      assert.equal(store.files.size, 0);
    }
    if (os === 'android') assert.equal(store.native(), null);
    await store.clearConnection(); // Ripetere l'operazione è sicuro.
  });
}

test('logout interrompe la rimozione se una copia legacy potrebbe ripristinare il login', async () => {
  const store = createStore('android', 'legacy');
  await assert.rejects(store.clearConnection(), /legacy/);
  assert.equal(store.secure.get(key), credentials);
});

test('logout segnala un errore se SecureStore non può cancellare le credenziali', async () => {
  const store = createStore('android', 'secure');
  await assert.rejects(store.clearConnection(), /SecureStore/);
});

test('dopo logout si può salvare e ripristinare un altro account', async () => {
  const store = createStore('android');
  await store.clearConnection();
  const next = { serverUrl: 'music.example.org', username: 'Marco', password: 'new-test-only' };
  await store.saveConnection(next);
  assert.equal(JSON.stringify(await store.loadConnection()), JSON.stringify({ ...next, serverUrl: 'https://music.example.org' }));
});
