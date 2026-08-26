import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class GioConnectionStoreModule extends NativeModule {
  save(value: string): boolean;
  load(): string | null;
  clear(): boolean;
}

export default requireOptionalNativeModule<GioConnectionStoreModule>('GioConnectionStore');
