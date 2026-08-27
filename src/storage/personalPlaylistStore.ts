import { readPrivateJson, writePrivateJson } from './privateJsonStore';

const KEY = 'gio-music.personal-playlists.v1';
const FILE_NAME = 'music-bank-personal-playlists-v1.json';

type PersonalPlaylistRegistry = Record<string, string[]>;

function normalizeRegistry(value: unknown): PersonalPlaylistRegistry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, ids]) => Array.isArray(ids))
      .map(([sourceKey, ids]) => [
        sourceKey,
        [...new Set((ids as unknown[]).filter((id): id is string => typeof id === 'string' && !!id))],
      ]),
  );
}

async function loadRegistry(): Promise<PersonalPlaylistRegistry> {
  return normalizeRegistry(await readPrivateJson<unknown>(FILE_NAME, KEY));
}

export async function loadPersonalPlaylistIds(sourceKey: string): Promise<Set<string>> {
  const registry = await loadRegistry();
  return new Set(registry[sourceKey] ?? []);
}

export async function rememberPersonalPlaylist(sourceKey: string, playlistId: string): Promise<Set<string>> {
  const registry = await loadRegistry();
  const next = new Set(registry[sourceKey] ?? []);
  next.add(playlistId);
  registry[sourceKey] = [...next];
  await writePrivateJson(FILE_NAME, registry, KEY);
  return next;
}

export async function forgetPersonalPlaylist(sourceKey: string, playlistId: string): Promise<Set<string>> {
  const registry = await loadRegistry();
  const next = new Set(registry[sourceKey] ?? []);
  next.delete(playlistId);
  if (next.size) registry[sourceKey] = [...next];
  else delete registry[sourceKey];
  await writePrivateJson(FILE_NAME, registry, KEY);
  return next;
}
