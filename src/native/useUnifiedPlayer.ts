import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioPlayer, AudioStatus } from 'expo-audio';
import {
  controlAndroidAuto, getAndroidAutoPlaybackState, usesAndroidAutoPlayer,
  type AndroidAutoPlaybackState,
} from './androidAuto';

/** iOS/web retain Expo; Android delegates every transport action to Media3. */
export function useUnifiedPlayer(expoPlayer: AudioPlayer, expoStatus: AudioStatus) {
  const [state, setState] = useState<AndroidAutoPlaybackState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const command = useCallback(async (name: string, value = 0) => {
    try {
      await controlAndroidAuto(name, value);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      throw reason;
    }
  }, []);
  useEffect(() => {
    if (!usesAndroidAutoPlayer) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const sampledAt = Date.now();
        const next = { ...await getAndroidAutoPlaybackState(), sampledAt };
        if (!disposed) { setState(next); setError(next.error); }
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!disposed) timer = setTimeout(poll, 500);
      }
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, []);
  const player = useMemo(() => {
    if (!usesAndroidAutoPlayer) return expoPlayer;
    const fire = (name: string, value = 0) => { void command(name, value).catch(() => {}); };
    return {
      play: () => fire('play'), pause: () => fire('pause'),
      seekTo: (seconds: number) => command('seek', seconds * 1000).then(() => {}).catch(() => {}),
      replace: (source: unknown) => { if (source === null) fire('clear'); },
      setActiveForLockScreen: () => {}, // MediaLibraryService owns the notification.
      setPlaybackRate: (rate: number) => fire('rate', rate),
      addListener: () => ({ remove() {} }), // Native ExoPlayer advances the queue itself.
      get isLoaded() { return stateRef.current?.loaded ?? false; },
      get currentStatus() { return { isLoaded: stateRef.current?.loaded ?? false }; },
      get playbackRate() { return stateRef.current?.playbackRate ?? 1; },
      set volume(value: number) { fire('volume', value); },
      set loop(value: boolean) { fire('repeat', value ? 1 : 0); },
    } as unknown as AudioPlayer;
  }, [command, expoPlayer]);
  const status: AudioStatus = usesAndroidAutoPlayer ? {
    ...expoStatus,
    currentTime: (state?.positionMs ?? 0) / 1000,
    duration: (state?.durationMs ?? 0) / 1000,
    playing: state?.playing ?? false,
    isLoaded: state?.loaded ?? false,
    isBuffering: state?.buffering ?? false,
    didJustFinish: false,
    playbackRate: state?.playbackRate ?? 1,
  } : expoStatus;
  return { player, status, state, error, command };
}
