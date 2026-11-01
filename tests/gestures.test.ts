import assert from 'node:assert/strict';
import test from 'node:test';
import { isQueueSwipe, queueDropIndex } from '../src/player/gestures.ts';

test('horizontal swipe triggers once past the threshold, vertical scrolling does not', () => {
  assert.equal(isQueueSwipe(100, 5), true);
  assert.equal(isQueueSwipe(15, 1), false);
  assert.equal(isQueueSwipe(80, 150), false);
  assert.equal(isQueueSwipe(-100, 0), false);
});
test('drag changes row in both directions and stays inside the queue', () => {
  assert.equal(queueDropIndex(2, 10, 116), 4);
  assert.equal(queueDropIndex(2, 10, -58), 1);
  assert.equal(queueDropIndex(2, 10, -1000), 0);
  assert.equal(queueDropIndex(2, 10, 1000), 9);
  assert.equal(queueDropIndex(2, 10, 5), 2);
});
