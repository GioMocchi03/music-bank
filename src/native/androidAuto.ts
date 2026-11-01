import { NativeModules, Platform } from 'react-native';

export type AndroidAutoPlaybackState = {
  sampledAt: number;
  audioSessionId: number;
  mediaId: string | null;
  positionMs: number;
  durationMs: number;
  playing: boolean;
  loaded: boolean;
  buffering: boolean;
  queueIds: string[];
  queueIndex: number;
  repeatMode: number;
  shuffle: boolean;
  playbackRate: number;
  error: string | null;
};
export type AutoQueueItem = {
  id: string; uri: string; title: string; artist?: string; album?: string; coverUrl?: string;
};
type AndroidAutoBridge = {
  getPlaybackState(): Promise<AndroidAutoPlaybackState>;
  controlPlayback(command: string, value: number): Promise<boolean>;
  setQueue(json: string, index: number, play: boolean): Promise<boolean>;
  editQueue(operation: string, index: number, target: number, json: string): Promise<boolean>;
  refreshCatalog(): Promise<boolean>;
};
const bridge: AndroidAutoBridge | undefined = Platform.OS === 'android'
  ? NativeModules.MusicBankAutoBridge : undefined;
export const usesAndroidAutoPlayer = Platform.OS === 'android';
function requireBridge(): AndroidAutoBridge {
  if (!bridge) throw new Error('Bridge Android Auto assente: reinstalla la build Android aggiornata.');
  return bridge;
}
export function getAndroidAutoPlaybackState(): Promise<AndroidAutoPlaybackState> {
  return requireBridge().getPlaybackState();
}
export function controlAndroidAuto(command: string, value = 0): Promise<boolean> {
  return requireBridge().controlPlayback(command, value);
}
export function setAndroidAutoQueue(items: AutoQueueItem[], index: number, play: boolean): Promise<boolean> {
  return requireBridge().setQueue(JSON.stringify(items), index, play);
}
export async function refreshAndroidAutoCatalog(): Promise<void> {
  if (Platform.OS === 'android') await requireBridge().refreshCatalog();
}

export function editAndroidAutoQueue(operation: 'move' | 'remove' | 'append' | 'next' | 'keepCurrent', index = 0, target = 0, item?: AutoQueueItem): Promise<boolean> {
  return requireBridge().editQueue(operation, index, target, JSON.stringify(item ?? {}));
}
