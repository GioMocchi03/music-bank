import assert from 'node:assert/strict';
import test from 'node:test';

import { compareVersions } from '../src/utils/version.ts';

test('confronta versioni GitHub con o senza prefisso v', () => {
  assert.equal(compareVersions('1.3.8', 'v1.3.7'), 1);
  assert.equal(compareVersions('v1.3.8', '1.3.8'), 0);
  assert.equal(compareVersions('1.3.8', '1.4.0'), -1);
  assert.equal(compareVersions('1.3', '1.3.0'), 0);
});
