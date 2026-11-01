import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import * as React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import { equalizerLevelAfterDrag } from '../src/player/equalizer.ts';
import { isQueueSwipe, queueDropIndex } from '../src/player/gestures.ts';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);

// Execute the actual app component bodies against React, with only native views mocked.
function components(onAdd: (song: unknown) => void = () => {}) {
  const source = ts.createSourceFile('App.tsx', readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(['TrackList', 'QueueModal', 'QueueRow', 'SwipeRightAction', 'EqualizerModal', 'EqualizerBand', 'MoreActionsModal']);
  const bodies = source.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text ?? '')).map((node) => node.getText(source)).join('\n');
  assert.equal(source.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text ?? '')).length, names.size);
  const exports = {} as Record<'TrackList' | 'QueueModal' | 'EqualizerModal' | 'MoreActionsModal', React.ComponentType<any>>;
  const calls: Array<{ session: number; enabled: boolean; levels: number[] }> = [];
  const sessions: number[] = [];
  const compiled = ts.transpileModule(bodies + '\nexport { TrackList, QueueModal, EqualizerModal, MoreActionsModal };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, {
    ...React, exports, require, setTimeout,
    View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', SafeAreaView: 'SafeAreaView',
    MaterialCommunityIcons: 'Icon', Artwork: () => null, DownloadIndicator: () => null,
    PanResponder: { create: (handlers: unknown) => ({ panHandlers: handlers }) },
    Platform: { OS: 'android' },
    styles: new Proxy({}, { get: () => ({}) }), lime: '#D6FF4B', formatTime: String,
    QueueActionsContext: React.createContext({ onAdd }),
    OfflineContext: React.createContext({ tracks: new Map(), jobs: {}, sourceKey: 'test' }),
    downloadKey: () => 'test', songBelongsToSource: () => true, downloadJobLabel: () => '',
    EQUALIZER_STORAGE_KEY: 'eq',
    AsyncStorage: { getItem: async () => JSON.stringify({ enabled: true, levels: [100, 200] }), setItem: async () => {} },
    GioConnectionStore: {
      getEqualizerInfo: (session: number) => { sessions.push(session); return { frequencies: [60, 230], minLevel: -1500, maxLevel: 1500 }; },
      configureEqualizer: (session: number, enabled: boolean, levels: number[]) => { calls.push({ session, enabled, levels: [...levels] }); return true; },
    },
    equalizerLevelAfterDrag, isQueueSwipe, queueDropIndex,
  });
  return { ...exports, calls, sessions };
}
const song = { id: 'a', title: 'Track A', artist: 'Artist' };
async function render(component: React.ComponentType<any>, props: Record<string, unknown>) {
  let view!: ReactTestRenderer;
  await act(async () => { view = create(React.createElement(component, props)); });
  return view;
}

test('three-dot actions retain append, play next and equalizer callbacks', async () => {
  const c = components(); let next = 0; let append = 0; let eq = 0;
  const view = await render(c.MoreActionsModal, { visible: true, song, onPlayNext: () => next++, onAppendQueue: () => append++, onEqualizer: () => eq++ });
  for (const label of ['Riproduci subito dopo', 'Aggiungi alla coda', 'Equalizzatore · DSP']) {
    const text = view.root.findAll((node) => String(node.type) === 'Text' && node.children.includes(label))[0];
    assert.ok(text, label);
    await act(async () => { text.parent!.props.onPress(); });
  }
  assert.deepEqual([next, append, eq], [1, 1, 1]);
  await act(async () => view.unmount());
});

test('track swipe appends without starting playback and survives polling renders', async () => {
  let added = 0; let played = 0;
  const c = components(() => added++);
  const props = { songs: [song], onPlay: () => played++ };
  const view = await render(c.TrackList, props);
  const release = view.root.findAll((node) => String(node.type) === 'View' && node.props.onPanResponderRelease)[0].props.onPanResponderRelease;
  await act(async () => view.update(React.createElement(c.TrackList, { ...props })));
  assert.equal(view.root.findAll((node) => String(node.type) === 'View' && node.props.onPanResponderRelease)[0].props.onPanResponderRelease, release);
  const host = view.root.findAll((node) => String(node.type) === 'View' && node.props.onPanResponderRelease)[0];
  await act(async () => { host.props.onPanResponderMove(null, { dx: 90, dy: 3 }); host.props.onPanResponderRelease(null, { dx: 90, dy: 3 }); });
  const row = view.root.findAll((node) => String(node.type) === 'Pressable' && !node.props.accessibilityLabel)[0];
  await act(async () => row.props.onPress());
  assert.deepEqual([added, played], [1, 0]);
  await act(async () => view.unmount());
});

test('queue exposes clear, drag reorder and swipe remove without playing a row', async () => {
  const c = components(); let cleared = 0; let played = 0; const moves: number[][] = []; const removed: number[] = [];
  const view = await render(c.QueueModal, { visible: true, queue: [song, { ...song, id: 'b', title: 'Track B' }], currentIndex: 0,
    onClear: () => cleared++, onPick: () => played++, onReorder: (from: number, to: number) => moves.push([from, to]), onRemove: (index: number) => removed.push(index) });
  const clear = view.root.findAll((node) => String(node.type) === 'Text' && node.children.includes('Svuota'))[0];
  await act(async () => clear.parent!.props.onPress());
  const handle = view.root.findAll((node) => String(node.type) === 'View' && node.props.accessibilityLabel === 'Trascina Track A')[0];
  await act(async () => handle.props.onPanResponderGrant());
  await act(async () => handle.props.onPanResponderMove(null, { dy: 58 }));
  await act(async () => handle.props.onPanResponderRelease());
  const swipe = view.root.findAll((node) => String(node.type) === 'View' && node.props.onPanResponderRelease && !node.props.accessibilityLabel)[0];
  await act(async () => swipe.props.onPanResponderRelease(null, { dx: 90, dy: 0 }));
  assert.equal(cleared, 1); assert.equal(played, 0); assert.deepEqual(moves, [[0, 1]]); assert.deepEqual(removed, [0]);
  await act(async () => view.unmount());
});

test('equalizer restores settings and applies band drags to the supplied Media3 session', async () => {
  const c = components();
  const view = await render(c.EqualizerModal, { visible: true, sessionId: 77, onClose() {} });
  assert.deepEqual(c.sessions, [77]);
  assert.ok(c.calls.length > 0);
  assert.equal(c.calls.at(-1)!.session, 77);
  assert.equal(c.calls.at(-1)!.enabled, true);
  assert.deepEqual(c.calls.at(-1)!.levels, [100, 200]);
  const bands = view.root.findAll((node) => String(node.type) === 'View' && node.props.onPanResponderMove);
  await act(async () => bands[0].props.onPanResponderGrant());
  await act(async () => bands[0].props.onPanResponderMove(null, { dy: -50 }));
  assert.ok(c.calls.at(-1)!.levels[0] > 100);
  await act(async () => view.update(React.createElement(c.EqualizerModal, { visible: false, sessionId: 88, onClose() {} })));
  assert.equal(c.calls.at(-1)!.session, 88);
  await act(async () => view.unmount());
});
