import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));
const pkg = json('package.json');
const lock = json('package-lock.json');
const app = json('app.json').expo;
const config = json('release.config.json');
const gradle = read('android/app/build.gradle');
const version = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
const code = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
for (const value of [lock.version, lock.packages[''].version, app.version, version]) {
  assert.equal(value, pkg.version, 'Versioni package/lock/app/Gradle non coerenti');
}
assert.ok(Number.isSafeInteger(code) && code > 0);
assert.equal(code, app.android.versionCode, 'versionCode non coerente');
assert.equal(app.android.package, config.applicationId);
assert.equal(gradle.match(/applicationId\s+'([^']+)'/)?.[1], config.applicationId);
assert.ok(read('App.tsx').includes(pkg.version), 'Aggiornare anche la versione visualizzata nell’app');
console.log(`Versioni coerenti: ${pkg.version} (${code}), ${config.applicationId}`);
