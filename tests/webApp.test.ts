import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

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
