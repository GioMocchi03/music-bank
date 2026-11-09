import assert from 'node:assert/strict';
import test from 'node:test';
import { configureWebEqualizer } from '../src/player/webEqualizer.ts';

class FakeNode {
  frequency = { value: 0 };
  gain = { value: 0 };
  Q = { value: 0 };
  type = '';
  connect() {}
  disconnect() {}
}

class FakeAudioContext {
  state = 'running';
  destination = {};
  createMediaElementSource() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  resume() { return Promise.resolve(); }
}

class FakeMedia {
  currentTime = 0;
  readyState = 0;
  private listeners = new Map<string, () => void>();
  addEventListener(name: string, listener: () => void) { this.listeners.set(name, listener); }
  loadMetadata() {
    this.readyState = 1;
    const listener = this.listeners.get('loadedmetadata');
    this.listeners.delete('loadedmetadata');
    listener?.();
  }
}

function fakePlayer() {
  const events: string[] = [];
  const player: any = {
    src: 'stream', media: new FakeMedia(), playing: true, sourceNode: null,
    pause() { this.playing = false; events.push('pause'); },
    play() { this.playing = true; events.push(`play@${this.media.currentTime}`); },
    replace(source: unknown) {
      events.push('replace');
      this.src = source;
      this.media = new FakeMedia();
      if (this.playing) this.play();
    },
    async seekTo(seconds: number) { this.media.currentTime = seconds; events.push(`seek@${seconds}`); },
  };
  player.media.currentTime = 16.7;
  player.media.readyState = 4;
  return { player, events };
}

(globalThis as any).window = { AudioContext: FakeAudioContext };

test('disattivare l’equalizzatore riprende dalla stessa posizione dopo i metadati', async () => {
  const { player, events } = fakePlayer();
  assert.equal(configureWebEqualizer(player, true, [0, 0, 0, 0, 0]), true);
  assert.equal(configureWebEqualizer(player, false, [0, 0, 0, 0, 0]), true);
  assert.deepEqual(events, ['pause', 'replace']);
  player.media.loadMetadata();
  await new Promise(setImmediate);
  assert.deepEqual(events, ['pause', 'replace', 'seek@16.7', 'play@16.7']);
});

test('un cambio brano prima dei metadati non riceve la posizione precedente', async () => {
  const { player, events } = fakePlayer();
  configureWebEqualizer(player, true, [0, 0, 0, 0, 0]);
  configureWebEqualizer(player, false, [0, 0, 0, 0, 0]);
  const restored = player.media;
  player.replace('next');
  restored.loadMetadata();
  await new Promise(setImmediate);
  assert.equal(events.some((event) => event.startsWith('seek')), false);
  assert.equal(player.media.currentTime, 0);
});

test('una traccia in pausa resta in pausa dopo aver disattivato l’equalizzatore', async () => {
  const { player, events } = fakePlayer();
  player.playing = false;
  configureWebEqualizer(player, true, [0, 0, 0, 0, 0]);
  configureWebEqualizer(player, false, [0, 0, 0, 0, 0]);
  player.media.loadMetadata();
  await new Promise(setImmediate);
  assert.deepEqual(events, ['replace', 'seek@16.7']);
});
