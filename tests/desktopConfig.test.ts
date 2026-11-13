import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const configUrl = new URL('../src-tauri/tauri.conf.json', import.meta.url);
const config = JSON.parse(readFileSync(configUrl, 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('desktop legge la versione condivisa e mantiene lo stesso identificatore dei dati', () => {
  assert.equal(config.version, '../package.json');
  const versionSource = JSON.parse(readFileSync(new URL(config.version, configUrl), 'utf8'));
  assert.equal(versionSource.version, pkg.version);
  assert.equal(config.identifier, 'io.servergio.musicbank.desktop');
});

test('desktop rigenera il frontend prima del packaging e usa il lockfile Rust', () => {
  assert.equal(config.build.beforeBuildCommand, 'npm run export:desktop');
  assert.equal(pkg.scripts['export:desktop'], 'expo export --platform web --output-dir dist');
  assert.equal(config.build.frontendDist, '../dist');
  assert.equal(pkg.scripts['build:windows'], 'tauri build --bundles nsis -- --locked');
  assert.equal(config.build.devUrl, 'http://localhost:8081');
  assert.match(config.build.beforeDevCommand, /--host localhost --port 8081$/);
  assert.equal(config.bundle.targets[0], 'nsis');
});

test('desktop macOS produce app e dmg universali con firma ad hoc e icona icns', () => {
  assert.equal(pkg.scripts['build:macos'], 'tauri build --target universal-apple-darwin --bundles app,dmg -- --locked');
  assert.equal(config.bundle.macOS.signingIdentity, '-');
  assert.equal(config.bundle.macOS.minimumSystemVersion, '11.0');
  assert.ok(config.bundle.icon.includes('icons/icon.icns'));
  assert.ok(config.bundle.icon.includes('icons/icon.ico'));
});
