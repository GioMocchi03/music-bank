import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import * as React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import { chooseFeaturedAlbum, featuredArtistKey } from '../src/utils/homeFeatured.ts';
import { normalizeSearchText } from '../src/utils/search.ts';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const source = ts.createSourceFile('App.tsx', readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const app = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'MusicBankApp')!;
const home = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'HomeScreen')!;
const bootstrap = app.body!.statements.find((node) => node.getText(source).includes("startupMark('bootstrap-start')"))!;
const startupSync = app.body!.statements.find((node) => node.getText(source).includes('const cacheAge = Date.now() - lastFullSyncAtRef.current'))!;
const selection = app.body!.statements.find((node) => node.getText(source).includes('const selected = chooseFeaturedAlbum('))!;
const featured = app.body!.statements.find((node) => ts.isVariableStatement(node)
  && node.declarationList.declarations.some((declaration) => declaration.name.getText(source) === 'featuredAlbum'))!;
const first = { id: 'first', name: 'Clic', artist: 'Franco Battiato', artistId: 'battiato' };
const favorite = { id: 'favorite', name: 'Soul Pirate', artist: 'Alborosie', artistId: 'alborosie', coverUrl: 'cover' };
const history = [{ song: { id: 'track', title: 'Track', albumId: favorite.id }, playedAt: 1, playCount: 10 }];

function compile(code: string) {
  return ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function startBootstrap(options: { saved?: boolean; brokenPreview?: boolean; brokenHistory?: boolean; syncedAt?: number } = {}) {
  const complete = deferred<{ songs: unknown[]; syncedAt: number } | null>();
  const state: Record<string, any> = {};
  const refs = { hasCachedLibraryRef: { current: false }, lastFullSyncAtRef: { current: 0 } };
  const setters = Object.fromEntries([
    'History', 'HistoryReady', 'OfflineTracks', 'PersonalPlaylistIds', 'Preferences', 'PreferencesReady',
    'Connection', 'AuthenticatedUsername', 'ActiveSourceKey', 'Connected', 'Message', 'Albums', 'Artists',
    'Genres', 'Playlists', 'Radios', 'LibraryPreviewReady', 'Songs', 'BootstrapReady',
  ].map((name) => [`set${name}`, (value: unknown) => { state[name] = value; }]));
  vm.runInNewContext(compile(bootstrap.getText(source)), {
    ...setters,
    useEffect: (start: () => unknown) => start(), verifyConnection() {}, startupMark() {},
    loadConnection: async () => options.saved === false ? null : { serverUrl: 'https://music.example.org', username: 'gio' },
    loadLibraryPreview: async () => {
      if (options.brokenPreview) throw new Error('Corrupt preview');
      return { albums: [first, favorite], artists: [], genres: [], playlists: [], radios: [], syncedAt: options.syncedAt ?? 1 };
    },
    loadLibrary: () => complete.promise,
    loadHistory: async () => {
      if (options.brokenHistory) throw new Error('Corrupt history');
      return history;
    },
    loadOfflineTracks: async () => [], loadPersonalPlaylistIds: async () => new Set(),
    loadPreferences: async () => ({ defaultPlaybackRate: 1 }),
    connectionSourceKey: () => 'source', NavidromeClient: class {},
    player: {}, offlineTracksRef: {}, clientRef: {}, restoredConnectionRef: {},
    ...refs, isAlbumFolderPlaylist: () => false, AUTO_SYNC_FRESHNESS_MS: 300_000,
    ensureAndroidAutoCatalog: async () => {},
  });
  return { state, complete, refs };
}

function startAutomaticSync(boot: ReturnType<typeof startBootstrap>) {
  const calls: string[] = [];
  vm.runInNewContext(compile(startupSync.getText(source)), {
    ...boot.refs, bootstrapReady: boot.state.BootstrapReady,
    startupSyncStartedRef: { current: false }, restoredConnectionRef: { current: { username: 'gio' } },
    AUTO_SYNC_FRESHNESS_MS: 300_000, setMessage() {},
    useEffect: (run: () => unknown) => run(),
    syncLibrary: () => { calls.push('sync'); }, verifyConnection: () => { calls.push('ping'); },
  });
  return calls;
}

function selectFeatured(overrides: Record<string, unknown> = {}) {
  let selected: string | undefined;
  let preferences: Record<string, unknown> = {};
  let songCount: number | undefined;
  vm.runInNewContext(compile(`${featured.getText(source)}\n${selection.getText(source)}`), {
    albums: [first, favorite], history, historyReady: true, libraryPreviewReady: true, preferencesReady: true,
    featuredAlbumId: null, preferences, useMemo: (read: () => unknown) => read(),
    bootstrapReady: false,
    songs: new Proxy([], { get() { throw new Error('La Home non deve scandire tutte le tracce'); } }),
    chooseFeaturedAlbum: (...args: Parameters<typeof chooseFeaturedAlbum>) => {
      songCount = args[1].length;
      return chooseFeaturedAlbum(...args);
    },
    featuredArtistKey,
    setFeaturedAlbumId: (id: string) => { selected = id; },
    setPreferences: (update: (value: typeof preferences) => typeof preferences) => { preferences = update(preferences); },
    useEffect: (run: () => unknown) => run(),
    ...overrides,
  });
  return { selected, preferences, songCount };
}

test('la preview rende pronta la Home prima delle tracce e del bootstrap completo', async () => {
  const boot = startBootstrap();
  await new Promise(setImmediate);
  assert.equal(boot.state.LibraryPreviewReady, true);
  assert.equal(boot.state.HistoryReady, true);
  assert.equal(boot.state.PreferencesReady, true);
  assert.equal(boot.state.BootstrapReady, undefined);
  assert.deepEqual(boot.state.Albums, [first, favorite]);
  const selected = selectFeatured();
  assert.equal(selected.selected, favorite.id);
  assert.equal(selected.songCount, 0);
  assert.equal(selected.preferences.lastFeaturedArtist, featuredArtistKey(favorite));
  boot.complete.resolve(null);
  await new Promise(setImmediate);
  assert.equal(boot.state.BootstrapReady, true);
});

test('una preview recente senza snapshot completo avvia la sincronizzazione di recupero', async () => {
  const boot = startBootstrap({ syncedAt: Date.now() });
  await new Promise(setImmediate);
  assert.deepEqual(boot.state.Albums, [first, favorite]);
  boot.complete.resolve(null);
  await new Promise(setImmediate);
  assert.equal(boot.state.BootstrapReady, true);
  assert.deepEqual(startAutomaticSync(boot), ['sync']);
});

test('uno snapshot completo recente, anche vuoto, evita una sincronizzazione inutile', async () => {
  const syncedAt = Date.now();
  const boot = startBootstrap({ syncedAt });
  boot.complete.resolve({ songs: [], syncedAt });
  await new Promise(setImmediate);
  assert.equal(boot.state.BootstrapReady, true);
  assert.deepEqual(startAutomaticSync(boot), ['ping']);
});

test('attende preferenze e cronologia ma non cambia una scelta già visibile', () => {
  for (const flags of [{ libraryPreviewReady: false }, { historyReady: false }, { preferencesReady: false }, { featuredAlbumId: favorite.id }, { albums: [] }]) {
    assert.equal(selectFeatured(flags).selected, undefined);
  }
});

test('se l’album sparisce o cambia la libreria non mantiene il suggerimento precedente', () => {
  const replacement = { id: 'new-album', name: 'New album', artist: 'New artist' };
  assert.equal(selectFeatured({ featuredAlbumId: favorite.id, albums: [replacement] }).selected, replacement.id);
});

test('una cache o cronologia corrotta non lascia la Home in caricamento infinito', async () => {
  for (const options of [{ brokenPreview: true }, { brokenHistory: true }]) {
    const boot = startBootstrap(options);
    boot.complete.resolve(null);
    await new Promise(setImmediate);
    assert.equal(boot.state.LibraryPreviewReady, true);
    assert.equal(boot.state.HistoryReady, true);
    assert.equal(boot.state.BootstrapReady, true);
  }
});

test('senza un server salvato non ripristina gli album della cache', async () => {
  const boot = startBootstrap({ saved: false });
  await new Promise(setImmediate);
  assert.equal(boot.state.Albums, undefined);
  assert.equal(boot.state.LibraryPreviewReady, true);
  boot.complete.resolve(null);
  await new Promise(setImmediate);
});

function HomeScreen() {
  const exports = {} as { HomeScreen: React.ComponentType<any> };
  vm.runInNewContext(compile(`${home.getText(source)}\nexport { HomeScreen };`), {
    ...React, exports, require, normalizeSearchText,
    View: 'View', Text: 'Text', Pressable: 'Pressable', Image: 'Image',
    ActivityIndicator: 'Spinner', LinearGradient: 'Gradient', MaterialCommunityIcons: 'Icon',
    IconButton: () => null, QuickAction: () => null, SectionTitle: () => null,
    ArtistGrid: () => null, GenreGrid: () => null, TrackList: () => null,
    useWindowDimensions: () => ({ width: 390 }),
    styles: new Proxy({}, { get: () => ({}) }), lime: '#D6FF4B',
  });
  return exports.HomeScreen;
}

test('il chiamante Home non usa il primo album come ripiego mentre aspetta la scelta', () => {
  let call: ts.JsxSelfClosingElement | undefined;
  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'HomeScreen') call = node;
    ts.forEachChild(node, visit);
  }
  visit(app);
  assert.ok(call);
  const bindings = call.attributes.properties.filter((property): property is ts.JsxAttribute =>
    ts.isJsxAttribute(property) && ['albums', 'featured', 'loading'].includes(property.name.getText(source)),
  ).map((property) => {
    const initializer = property.initializer as ts.JsxExpression;
    return `${property.name.getText(source)}: ${initializer.expression!.getText(source)}`;
  }).join(',');
  const read = (flags: Record<string, unknown>) => {
    const context = { albums: [first, favorite], featuredAlbumId: null, libraryPreviewReady: true,
      historyReady: true, preferencesReady: true, bootstrapReady: false,
      connectionConfigured: true, busy: false, useMemo: (read: () => unknown) => read(), ...flags };
    return vm.runInNewContext(compile(`${featured.getText(source)}\n({${bindings}});`), context);
  };
  const pending = read({});
  assert.equal(pending.featured, undefined);
  assert.equal(pending.loading, true);
  const selected = read({ featuredAlbumId: favorite.id });
  assert.equal(selected.featured, favorite);
  assert.equal(selected.loading, false);
  assert.equal(read({ featuredAlbumId: favorite.id, bootstrapReady: true }).featured, favorite);
});

const baseProps = { albums: [], artists: [], genres: [], history: [], loading: true,
  connected: false, configured: false, columns: 2, onConnect() {} };

function texts(view: ReactTestRenderer) {
  return view.root.findAll((node) => String(node.type) === 'Text').flatMap((node) => node.children).filter((text) => typeof text === 'string');
}

test('al primo avvio mostra solo un caricamento neutro, poi il suggerimento reale', async () => {
  const Home = HomeScreen();
  let view!: ReactTestRenderer;
  await act(async () => { view = create(React.createElement(Home, baseProps)); });
  assert.ok(texts(view).includes('Preparazione del tuo suggerimento…'));
  assert.ok(!texts(view).includes('Collega Navidrome'));
  assert.equal(view.root.findAll((node) => String(node.type) === 'Pressable').length, 0);
  await act(async () => view.update(React.createElement(Home, { ...baseProps, albums: [first, favorite], configured: true, connected: true })));
  assert.ok(!texts(view).includes(first.name));
  let played: unknown;
  await act(async () => view.update(React.createElement(Home, { ...baseProps, albums: [first, favorite], featured: favorite,
    loading: false, configured: true, connected: true, onPlayAlbum: (album: unknown) => { played = album; } })));
  assert.ok(texts(view).includes(favorite.name));
  assert.ok(texts(view).includes(favorite.artist));
  assert.ok(!texts(view).includes(first.name));
  await act(async () => view.root.findAll((node) => String(node.type) === 'Pressable')[0].props.onPress());
  assert.equal(played, favorite);
  await act(async () => view.unmount());
});

test('mantiene il suggerimento offline e rimuove quello vecchio dopo il logout', async () => {
  const Home = HomeScreen();
  let view!: ReactTestRenderer;
  await act(async () => { view = create(React.createElement(Home, { ...baseProps, albums: [favorite], featured: favorite, loading: false, configured: true })); });
  assert.ok(texts(view).includes('LIBRERIA LOCALE'));
  assert.ok(texts(view).includes(favorite.name));
  await act(async () => view.update(React.createElement(Home, { ...baseProps, loading: false })));
  assert.ok(texts(view).includes('Collega Navidrome'));
  assert.ok(!texts(view).includes(favorite.name));
  await act(async () => view.update(React.createElement(Home, { ...baseProps, loading: false, configured: true })));
  assert.ok(texts(view).includes('Nessun album sincronizzato'));
  assert.ok(!texts(view).includes('La tua libreria è vuota'));
  assert.ok(!texts(view).includes('Collega Navidrome'));
  await act(async () => view.unmount());
});
