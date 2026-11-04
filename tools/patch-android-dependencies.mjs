import { readFile, writeFile } from 'node:fs/promises';

const gradleFile = new URL('../node_modules/@react-native-async-storage/async-storage/android/build.gradle', import.meta.url);
let contents = await readFile(gradleFile, 'utf8');
contents = contents.replace('apply plugin: "kotlin-android"\r\n', '').replace('apply plugin: "kotlin-android"\n', '');
await writeFile(gradleFile, contents);
