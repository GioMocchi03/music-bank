import assert from 'node:assert/strict';
import test from 'node:test';

import { equalizerLevelAfterDrag } from '../src/player/equalizer.ts';

test('trascinare una banda verso l’alto aumenta il guadagno', () => {
  assert.equal(equalizerLevelAfterDrag(0, -95, 190, -1500, 1500), 1500);
});

test('trascinare una banda verso il basso riduce il guadagno', () => {
  assert.equal(equalizerLevelAfterDrag(0, 95, 190, -1500, 1500), -1500);
});

test('il livello resta entro il range nativo', () => {
  assert.equal(equalizerLevelAfterDrag(1000, -500, 190, -1500, 1500), 1500);
  assert.equal(equalizerLevelAfterDrag(-1000, 500, 190, -1500, 1500), -1500);
});
