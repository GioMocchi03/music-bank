import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
export { compareVersions } from '../utils/version';

export const APP_VERSION = '1.3.9';
export const APP_BUILD = 23;
export const PRIVATE_RELEASES_URL = 'https://github.com/GioMocchi03/music-bank/releases/latest';

const TOKEN_KEY = 'music-bank.github.release-token.v1';
const RELEASE_API_URL = 'https://api.github.com/repos/GioMocchi03/music-bank/releases/latest';
const REQUEST_TIMEOUT_MS = 15_000;

export type GithubRelease = {
  version: string;
  name: string;
  url: string;
  publishedAt?: string;
  apkName?: string;
};

export async function loadGithubReleaseToken(): Promise<string> {
  if (Platform.OS === 'web') return '';
  try {
    return (await SecureStore.getItemAsync(TOKEN_KEY)) ?? '';
  } catch {
    return '';
  }
}

export async function saveGithubReleaseToken(token: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const normalized = token.trim();
  if (!normalized) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, normalized);
  if (await SecureStore.getItemAsync(TOKEN_KEY) !== normalized) {
    throw new Error('Il token GitHub non è stato salvato correttamente.');
  }
}

export async function clearGithubReleaseToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function fetchLatestPrivateRelease(token = '', signal?: AbortSignal): Promise<GithubRelease> {
  const normalized = token.trim();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(RELEASE_API_URL, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        ...(normalized ? { Authorization: `Bearer ${normalized}` } : {}),
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (response.status === 401) throw new Error('Token GitHub non valido o scaduto.');
    if (response.status === 403) throw new Error('GitHub ha temporaneamente raggiunto il limite delle richieste. Riprova più tardi.');
    if (response.status === 404) throw new Error('Repository o release GitHub non disponibile.');
    if (!response.ok) throw new Error(`Controllo aggiornamenti non riuscito (${response.status}).`);
    const payload = await response.json() as {
      tag_name?: string;
      name?: string;
      html_url?: string;
      published_at?: string;
      assets?: Array<{ name?: string }>;
    };
    if (!payload.tag_name || !payload.html_url) throw new Error('GitHub ha restituito una release incompleta.');
    return {
      version: payload.tag_name.replace(/^v/i, ''),
      name: payload.name ?? payload.tag_name,
      url: payload.html_url,
      publishedAt: payload.published_at,
      apkName: payload.assets?.find((asset) => asset.name?.toLocaleLowerCase().endsWith('.apk'))?.name,
    };
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('GitHub non ha risposto entro 15 secondi.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
