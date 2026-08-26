import { readPrivateJson, writePrivateJson } from './privateJsonStore';

const KEY = 'music-bank.preferences.v1';
const FILE_NAME = 'music-bank-preferences-v1.json';

export type AppPreferences = {
  amoledTheme: boolean;
  compactGrid: boolean;
  showAudioDetails: boolean;
  backgroundPlayback: boolean;
  preferOffline: boolean;
  defaultPlaybackRate: number;
  lastFeaturedArtist?: string;
  lastFeaturedAlbumId?: string;
};

export const defaultPreferences: AppPreferences = {
  amoledTheme: false,
  compactGrid: false,
  showAudioDetails: true,
  backgroundPlayback: true,
  preferOffline: true,
  defaultPlaybackRate: 1,
};

export async function loadPreferences(): Promise<AppPreferences> {
  const value = await readPrivateJson<Partial<AppPreferences>>(FILE_NAME, KEY);
  if (!value || typeof value !== 'object') return defaultPreferences;
  return {
    amoledTheme: typeof value.amoledTheme === 'boolean' ? value.amoledTheme : defaultPreferences.amoledTheme,
    compactGrid: typeof value.compactGrid === 'boolean' ? value.compactGrid : defaultPreferences.compactGrid,
    showAudioDetails: typeof value.showAudioDetails === 'boolean' ? value.showAudioDetails : defaultPreferences.showAudioDetails,
    backgroundPlayback: typeof value.backgroundPlayback === 'boolean' ? value.backgroundPlayback : defaultPreferences.backgroundPlayback,
    preferOffline: typeof value.preferOffline === 'boolean' ? value.preferOffline : defaultPreferences.preferOffline,
    lastFeaturedArtist: typeof value.lastFeaturedArtist === 'string' ? value.lastFeaturedArtist : undefined,
    lastFeaturedAlbumId: typeof value.lastFeaturedAlbumId === 'string' ? value.lastFeaturedAlbumId : undefined,
    defaultPlaybackRate: typeof value.defaultPlaybackRate === 'number' && Number.isFinite(value.defaultPlaybackRate)
      ? Math.max(0.1, Math.min(2, value.defaultPlaybackRate))
      : defaultPreferences.defaultPlaybackRate,
  };
}

export async function savePreferences(preferences: AppPreferences): Promise<void> {
  await writePrivateJson(FILE_NAME, preferences, KEY);
}
