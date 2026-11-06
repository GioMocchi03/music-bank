import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Blocks a release whose APK would not install over the official one.
const apk = process.argv[2];
if (!apk || !existsSync(apk)) throw new Error('Uso: node tools/verify-apk-certificate.mjs <file.apk>');
const root = fileURLToPath(new URL('../', import.meta.url));
const expected = JSON.parse(readFileSync(resolve(root, 'release.config.json'), 'utf8')).certificateSha256.toLowerCase();

function apksigner() {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (!sdk) return 'apksigner';
  const tools = resolve(sdk, 'build-tools');
  const versions = existsSync(tools)
    ? readdirSync(tools).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    : [];
  return versions.length ? resolve(tools, versions.at(-1), 'apksigner') : 'apksigner';
}

const output = execFileSync(apksigner(), ['verify', '--print-certs', apk], { encoding: 'utf8' });
const digests = [...output.matchAll(/certificate SHA-256 digest:\s*([0-9a-f]+)/gi)].map((match) => match[1].toLowerCase());
if (digests.length !== 1 || digests[0] !== expected) {
  throw new Error(`Certificato APK ${digests.join(', ') || 'assente'} diverso da quello ufficiale ${expected}.`);
}
console.log(`Certificato APK ufficiale verificato: ${expected}`);
