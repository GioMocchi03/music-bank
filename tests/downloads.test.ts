import assert from 'node:assert/strict';
import test from 'node:test';
import { connectionSourceKey, downloadJobLabel, downloadKey, DownloadQueue, formatDownloadSize, songBelongsToSource } from '../src/utils/downloads.ts';

test('identifica separatamente le tracce di server e utenti diversi senza includere password', () => {
  const a = connectionSourceKey({ serverUrl: 'music.example.org', username: 'Anna', password: 'private' });
  const b = connectionSourceKey({ serverUrl: 'music.example.org', username: 'Marco', password: 'private' });
  assert.ok(!a.includes('private'));
  const song = { id: '1', title: 'Test' };
  assert.notEqual(downloadKey(song, a), downloadKey(song, b));
  assert.equal(downloadKey({ ...song, offlineSourceKey: a }, b), downloadKey(song, a));
});

test('serializza i download, salta i doppi tap e prosegue dopo un errore', async () => {
  const queue = new DownloadQueue();
  const calls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = queue.enqueue('1', async () => { calls.push('first'); await gate; throw new Error('Network'); })!;
  const failure = assert.rejects(first, /Network/);
  assert.equal(queue.enqueue('1', async () => { calls.push('duplicate'); }), undefined);
  const second = queue.enqueue('2', async () => { calls.push('second'); })!;
  await Promise.resolve();
  assert.deepEqual(calls, ['first']);
  assert.equal(queue.busy, true);
  release();
  await failure;
  await second;
  assert.deepEqual(calls, ['first', 'second']);
  assert.equal(queue.busy, false);
  await queue.enqueue('1', async () => { calls.push('retry'); });
  assert.equal(calls.at(-1), 'retry');
});

test('un download di un altro account non autorizza azioni sul server corrente', () => {
  const song = { id: 'same-id', title: 'Test', offlineSourceKey: 'account-A' };
  assert.equal(songBelongsToSource(song, 'account-A'), true);
  assert.equal(songBelongsToSource(song, 'account-B'), false);
  assert.equal(songBelongsToSource(song, 'legacy'), false);
  assert.equal(songBelongsToSource({ id: 'same-id', title: 'Test' }, 'account-B'), true);
});

test('descrive coda, avanzamento reale ed errore senza inventare percentuali', () => {
  const song = { id: '1', title: 'Test' };
  assert.equal(downloadJobLabel({ song, status: 'queued' }), 'In coda');
  assert.equal(downloadJobLabel({ song, status: 'downloading' }), 'Scaricamento…');
  assert.equal(downloadJobLabel({ song, status: 'downloading', progress: 0.42 }), 'Scaricamento 42%');
  assert.equal(downloadJobLabel({ song, status: 'error' }), 'Errore · Riprova');
  assert.equal(formatDownloadSize(1024 ** 3), '1.0 GB');
});
