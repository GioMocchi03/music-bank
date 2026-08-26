import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import GioConnectionStore from '../../modules/gio-equalizer/src/GioConnectionStoreModule';
import { NavidromeConnection } from '../subsonic/NavidromeClient';
import { normalizeServerUrl } from '../utils/connection';

const KEY = 'gio-music.navidrome.connection';
const RECOVERY_FILE = 'music-bank-connection.json';

function normalizeConnection(connection: NavidromeConnection): NavidromeConnection {
  return {
    serverUrl: normalizeServerUrl(connection.serverUrl),
    username: connection.username.trim(),
    password: connection.password,
  };
}

function parseConnection(value: string | null): NavidromeConnection | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<NavidromeConnection>;
    if (
      typeof parsed.serverUrl !== 'string' ||
      typeof parsed.username !== 'string' ||
      typeof parsed.password !== 'string' ||
      !parsed.serverUrl.trim() ||
      !parsed.username.trim() ||
      !parsed.password
    ) return null;
    return normalizeConnection(parsed as NavidromeConnection);
  } catch {
    return null;
  }
}

async function readRecoveryFile(): Promise<string | null> {
  try {
    const source = new File(Paths.document, RECOVERY_FILE);
    return source.exists ? await source.text() : null;
  } catch {
    return null;
  }
}

async function removeLegacyCopies(strict = false): Promise<void> {
  if (Platform.OS === 'android' && GioConnectionStore) {
    try {
      if (!GioConnectionStore.clear() && strict) throw new Error('Rimozione provider legacy non riuscita.');
    } catch (error) { if (strict) throw error; }
  }
  try {
    const recovery = new File(Paths.document, RECOVERY_FILE);
    if (recovery.exists) recovery.delete();
  } catch (error) { if (strict) throw error; }
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (error) { if (strict) throw error; }
}

export async function clearConnection(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(KEY);
    if (await AsyncStorage.getItem(KEY) !== null) throw new Error('Rimozione del server non riuscita.');
    return;
  }
  // Prima elimina le copie legacy, altrimenti il prossimo avvio le ripristina.
  await removeLegacyCopies(true);
  await SecureStore.deleteItemAsync(KEY);
  if (await SecureStore.getItemAsync(KEY) !== null) throw new Error('Rimozione del server non riuscita.');
}

export async function saveConnection(connection: NavidromeConnection): Promise<void> {
  const value = JSON.stringify(normalizeConnection(connection));
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(KEY, value);
    return;
  }

  try {
    await SecureStore.setItemAsync(KEY, value);
    const persisted = await SecureStore.getItemAsync(KEY);
    if (persisted !== value) throw new Error('Verifica SecureStore non riuscita.');
    await removeLegacyCopies();
  } catch {
    throw new Error('Impossibile salvare il server sul dispositivo. Libera spazio e riprova.');
  }
}

export async function loadConnection(): Promise<NavidromeConnection | null> {
  if (Platform.OS === 'web') {
    try {
      return parseConnection(await AsyncStorage.getItem(KEY));
    } catch {
      return null;
    }
  }

  let secureValue: string | null = null;
  try {
    secureValue = await SecureStore.getItemAsync(KEY);
  } catch {
    // Prosegui con il file privato di recupero.
  }
  const secureConnection = parseConnection(secureValue);
  if (secureConnection) {
    await removeLegacyCopies();
    return secureConnection;
  }

  // Migrazione una tantum dalle vecchie copie non cifrate. Dopo aver scritto e
  // verificato SecureStore, le copie legacy vengono eliminate.
  let legacyConnection: NavidromeConnection | null = null;
  if (Platform.OS === 'android' && GioConnectionStore) {
    try {
      legacyConnection = parseConnection(GioConnectionStore.load());
    } catch {}
  }
  legacyConnection ??= parseConnection(await readRecoveryFile());
  if (!legacyConnection) {
    try {
      legacyConnection = parseConnection(await AsyncStorage.getItem(KEY));
    } catch {}
  }
  if (legacyConnection) {
    await saveConnection(legacyConnection);
    return legacyConnection;
  }
  return null;
}
