import assert from 'node:assert/strict';
import test from 'node:test';

import { appendToQueue, insertNextInQueue, moveQueueItem, movedQueueIndex, nextQueueIndex, previousQueueIndex, removeQueueItem, removedQueueIndex } from '../src/player/queue.ts';

test('avanza in ordine e si ferma in fondo senza ripetizione', () => {
  assert.equal(nextQueueIndex({ length: 3, index: 0, shuffle: false, repeat: 'none' }), 1);
  assert.equal(nextQueueIndex({ length: 3, index: 2, shuffle: false, repeat: 'none' }), null);
  assert.equal(nextQueueIndex({ length: 0, index: -1, shuffle: false, repeat: 'none' }), null);
});

test('la ripetizione di tutta la coda torna al primo brano', () => {
  assert.equal(nextQueueIndex({ length: 3, index: 2, shuffle: false, repeat: 'all' }), 0);
  assert.equal(nextQueueIndex({ length: 3, index: 1, shuffle: false, repeat: 'all' }), 2);
});

test('la ripetizione di un brano non blocca il salto al successivo', () => {
  assert.equal(nextQueueIndex({ length: 3, index: 0, shuffle: false, repeat: 'one' }), 1);
  assert.equal(nextQueueIndex({ length: 3, index: 2, shuffle: false, repeat: 'one' }), null);
});

test('lo shuffle esclude il brano corrente', () => {
  const seen = new Set<number>();
  for (let step = 0; step < 20; step += 1) {
    const next = nextQueueIndex({
      length: 4,
      index: 1,
      shuffle: true,
      repeat: 'none',
      random: () => step / 20,
    });
    assert.notEqual(next, 1);
    assert.ok(next !== null && next >= 0 && next < 4);
    seen.add(next);
  }
  assert.deepEqual([...seen].sort(), [0, 2, 3]);
});

test('con un solo brano lo shuffle resta su quello', () => {
  assert.equal(nextQueueIndex({ length: 1, index: 0, shuffle: true, repeat: 'none', random: () => 0.9 }), 0);
});

test('il precedente torna indietro e con repeat all riparte dall’ultimo', () => {
  assert.equal(previousQueueIndex({ length: 3, index: 2, repeat: 'none' }), 1);
  assert.equal(previousQueueIndex({ length: 3, index: 0, repeat: 'none' }), 0);
  assert.equal(previousQueueIndex({ length: 3, index: 0, repeat: 'all' }), 2);
  assert.equal(previousQueueIndex({ length: 0, index: -1, repeat: 'none' }), 0);
});

test('aggiunge un brano in fondo senza modificare la coda esistente', () => {
  assert.deepEqual(appendToQueue(['a', 'b'], 'c'), ['a', 'b', 'c']);
});

test('riordina la coda e mantiene coerente l’indice del brano corrente', () => {
  assert.deepEqual(moveQueueItem(['a', 'b', 'c', 'd'], 1, 3), ['a', 'c', 'd', 'b']);
  assert.equal(movedQueueIndex(1, 1, 3), 3);
  assert.equal(movedQueueIndex(2, 1, 3), 1);
  assert.equal(movedQueueIndex(2, 3, 0), 3);
  assert.equal(movedQueueIndex(0, 3, 1), 0);
});

test('inserisce play next subito dopo il brano corrente', () => {
  assert.deepEqual(insertNextInQueue(['a', 'b', 'c'], 1, 'x'), ['a', 'b', 'x', 'c']);
  assert.deepEqual(insertNextInQueue([], -1, 'x'), ['x']);
});

test('rimuove una traccia e riallinea il brano corrente', () => {
  assert.deepEqual(removeQueueItem(['a', 'b', 'c'], 1), ['a', 'c']);
  assert.equal(removedQueueIndex(2, 0, 2), 1);
  assert.equal(removedQueueIndex(1, 1, 2), 1);
  assert.equal(removedQueueIndex(2, 2, 2), 1);
  assert.equal(removedQueueIndex(0, 0, 0), -1);
});
