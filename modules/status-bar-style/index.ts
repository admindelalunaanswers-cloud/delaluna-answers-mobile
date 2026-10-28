/**
 * The native half of src/components/app-status-bar.tsx (iOS only).
 *
 * Optional on purpose: a build without the module — a dev client built before
 * it, an OTA bundle on an older binary, Jest — gets null and AppStatusBar falls
 * back to expo-status-bar, instead of crashing on import.
 */
export interface StatusBarStyleNativeModule {
  setStyle(style: 'light' | 'dark' | 'default', animated: boolean): Promise<void>;
}

let nativeModule: StatusBarStyleNativeModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  nativeModule = require('expo').requireOptionalNativeModule('StatusBarStyle');
} catch {
  nativeModule = null;
}

export default nativeModule;
