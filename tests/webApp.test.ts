import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const read = (path: string) => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8');

test('la webapp si installa sulla schermata Home con icone esistenti', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  for (const icon of manifest.icons) assert.ok(existsSync(new URL(`../public${icon.src}`, import.meta.url)), icon.src);
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="\/manifest.json" \/>/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/icon-180.png" \/>/);
  assert.match(html, /viewport-fit=cover/);
});

test('la webapp non viene indicizzata e registra il service worker solo in HTTPS', () => {
  assert.match(read('robots.txt'), /Disallow: \/$/m);
  const html = read('index.html');
  assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.match(html, /location.protocol === 'https:'/);
});

test('il service worker non mette in cache le API e l’audio del server', () => {
  const sw = read('sw.js');
  assert.match(sw, /url.origin !== self.location.origin/);
  assert.match(sw, /startsWith\('\/rest\/'\)/);
  assert.match(sw, /headers.has\('range'\)/);
});

function loadServiceWorker(cacheStorage: unknown, fetchImpl: (request: unknown) => Promise<unknown>) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const self = { location: { origin: 'https://musicbank.test' }, addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn) };
  runInNewContext(read('sw.js'), { self, caches: cacheStorage, fetch: fetchImpl, URL, Promise });
  return (url: string, mode = 'no-cors') => {
    let pending: Promise<unknown> | undefined;
    const request = { url, mode, method: 'GET', headers: new Map() };
    const kept: Promise<unknown>[] = [];
    listeners.fetch({ request, respondWith: (value: Promise<unknown>) => (pending = value), waitUntil: (value: Promise<unknown>) => kept.push(value) });
    return pending && pending.then(async (response) => (await Promise.all(kept), response));
  };
}

test('se la cache del browser è piena la webapp si carica lo stesso dalla rete', async () => {
  const full = { match: async () => undefined, put: async () => { throw new Error('QuotaExceededError'); } };
  const respond = loadServiceWorker({ open: async () => full }, async () => ({ ok: true, clone() { return this; }, body: 'rete' }));
  assert.equal(((await respond('https://musicbank.test/_expo/static/js/web/app-abc.js')) as { body: string }).body, 'rete');
  assert.equal(((await respond('https://musicbank.test/', 'navigate')) as { body: string }).body, 'rete');

  const broken = loadServiceWorker({ open: async () => { throw new Error('SecurityError'); } }, async () => ({ ok: true, clone() { return this; }, body: 'rete' }));
  assert.equal(((await broken('https://musicbank.test/_expo/static/js/web/app-abc.js')) as { body: string }).body, 'rete');
});

test('il service worker tiene vivo il salvataggio in cache finché non è finito', async () => {
  const saved: string[] = [];
  const shell = { match: async () => undefined, put: async (key: { url?: string } | string) => saved.push(typeof key === 'string' ? key : key.url ?? '') };
  const respond = loadServiceWorker({ open: async () => shell }, async () => ({ ok: true, clone() { return this; }, body: 'rete' }));
  await respond('https://musicbank.test/_expo/static/js/web/app-abc.js');
  await respond('https://musicbank.test/album/1', 'navigate');
  assert.deepEqual(saved, ['https://musicbank.test/_expo/static/js/web/app-abc.js', '/']);
});

test('offline il service worker restituisce la copia in cache e non intercetta /rest', async () => {
  const shell = { match: async () => ({ body: 'cache' }), put: async () => {} };
  const respond = loadServiceWorker({ open: async () => shell }, async () => { throw new TypeError('offline'); });
  assert.equal(((await respond('https://musicbank.test/album/1', 'navigate')) as { body: string }).body, 'cache');
  assert.equal(respond('https://musicbank.test/rest/stream.view?id=1'), undefined);
});
