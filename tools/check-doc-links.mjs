import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith('.md') ? [path] : [];
  });
}
const files = [
  ...readdirSync(root).filter((name) => name.endsWith('.md')).map((name) => resolve(root, name)),
  ...markdownFiles(resolve(root, 'docs')),
];
const missing = [];
for (const file of files) {
  const content = readFileSync(file, 'utf8');
  for (const match of content.matchAll(/\]\(([^)]+)\)|(?:href|src)="([^"]+)"/g)) {
    const link = (match[1] ?? match[2]).replace(/^<|>$/g, '').split('#')[0];
    if (!link || /^[a-z]+:/i.test(link) || link.startsWith('//')) continue;
    if (!existsSync(resolve(dirname(file), decodeURIComponent(link)))) missing.push(`${file}: ${link}`);
  }
}
if (missing.length) throw new Error(`Link locali mancanti:\n${missing.join('\n')}`);
console.log(`Link locali verificati in ${files.length} documenti.`);
