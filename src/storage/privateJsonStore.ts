import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

export async function readPrivateJson<T>(fileName: string, legacyKey?: string): Promise<T | null> {
  if (Platform.OS === 'web') {
    if (!legacyKey) return null;
    try {
      const value = await AsyncStorage.getItem(legacyKey);
      return value ? JSON.parse(value) as T : null;
    } catch {
      return null;
    }
  }

  try {
    const file = new File(Paths.document, fileName);
    if (file.exists) return JSON.parse(await file.text()) as T;
  } catch {
    // Un file danneggiato non deve impedire l'avvio.
  }

  if (!legacyKey) return null;
  try {
    const legacy = await AsyncStorage.getItem(legacyKey);
    if (!legacy) return null;
    const parsed = JSON.parse(legacy) as T;
    try {
      await writePrivateJson(fileName, parsed, legacyKey);
    } catch {
      // La copia SQLite rimane leggibile se la migrazione non riesce.
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writePrivateJson<T>(fileName: string, value: T, legacyKey?: string): Promise<void> {
  const serialized = JSON.stringify(value);
  if (Platform.OS === 'web') {
    if (!legacyKey) throw new Error('Chiave web mancante.');
    await AsyncStorage.setItem(legacyKey, serialized);
    return;
  }

  const destination = new File(Paths.document, fileName);
  const temporary = new File(Paths.document, `${fileName}.tmp`);
  temporary.create({ overwrite: true, intermediates: true });
  temporary.write(serialized);
  await temporary.move(destination, { overwrite: true });

  if (legacyKey) {
    try {
      await AsyncStorage.removeItem(legacyKey);
    } catch {
      // Non dipendiamo piu dal database SQLite storico.
    }
  }
}

export async function deletePrivateJson(fileName: string, legacyKey?: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (legacyKey) await AsyncStorage.removeItem(legacyKey);
    return;
  }
  try {
    const file = new File(Paths.document, fileName);
    if (file.exists) file.delete();
  } catch {
    // Il file puo essere gia assente.
  }
  if (legacyKey) {
    try {
      await AsyncStorage.removeItem(legacyKey);
    } catch {
      // Ignora il vecchio database non scrivibile.
    }
  }
}
