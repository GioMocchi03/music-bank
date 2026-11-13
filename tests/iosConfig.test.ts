import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;

test('iOS usa lo stesso identificatore Android e la riproduzione in background', () => {
  assert.equal(app.ios.bundleIdentifier, app.android.package);
  const audio = app.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-audio');
  assert.equal(audio?.[1]?.enableBackgroundPlayback, true);
  assert.equal(audio?.[1]?.microphonePermission, false);
});
