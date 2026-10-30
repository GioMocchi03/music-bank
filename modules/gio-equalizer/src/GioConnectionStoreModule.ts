import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class GioConnectionStoreModule extends NativeModule {
  save(value: string): boolean;
  load(): string | null;
  clear(): boolean;
  openSystemEqualizer(): boolean;
  configureEqualizer(sessionId: number, enabled: boolean, levels: number[]): boolean;
  getEqualizerInfo(sessionId: number): { frequencies: number[]; minLevel: number; maxLevel: number; levels: number[] } | null;
}

export default requireOptionalNativeModule<GioConnectionStoreModule>('GioConnectionStore');
