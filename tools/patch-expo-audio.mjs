import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../node_modules/expo-audio/android/src/main/java/expo/modules/audio/AudioModule.kt', import.meta.url));
const marker = 'Property("audioSessionId")';
let source = readFileSync(file, 'utf8');

if (!source.includes(marker)) {
  const anchor = `      Property("id") { player ->\n        player.id\n      }`;
  if (!source.includes(anchor)) throw new Error('Expo Audio 57 non corrisponde alla patch audioSessionId attesa');
  source = source.replace(anchor, `${anchor}\n\n      Property("audioSessionId") { player ->\n        runOnMain {\n          player.ref.audioSessionId\n        }\n      }`);
  writeFileSync(file, source);
  console.log('Expo Audio: audioSessionId esposto al modulo equalizzatore');
}
