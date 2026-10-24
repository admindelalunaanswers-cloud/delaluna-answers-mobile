import type { FirebaseApp } from 'firebase/app';

const mockCustomProvider = jest.fn();
const mockInitializeJsAppCheck = jest.fn();
jest.mock('firebase/app-check', () => ({
  CustomProvider: jest.fn().mockImplementation((options) => {
    mockCustomProvider(options);
    return { options };
  }),
  initializeAppCheck: (...args: unknown[]) => mockInitializeJsAppCheck(...args),
}));

const mockConfigure = jest.fn();
const mockInitializeNative = jest.fn();
const mockGetNativeToken = jest.fn();
jest.mock('@react-native-firebase/app-check', () => ({
  ReactNativeFirebaseAppCheckProvider: jest.fn().mockImplementation(() => ({
    configure: mockConfigure,
  })),
  initializeAppCheck: (...args: unknown[]) => mockInitializeNative(...args),
  getToken: (...args: unknown[]) => mockGetNativeToken(...args),
}));

const NATIVE_APP = { name: '[DEFAULT]' };
const mockGetNativeApp = jest.fn(() => NATIVE_APP);
jest.mock('@react-native-firebase/app', () => ({ getApp: () => mockGetNativeApp() }));

const JS_APP = { name: '[DEFAULT]' } as FirebaseApp;

/** A JWT with the given claims; App Check only reads the payload. */
const jwt = (claims: Record<string, unknown>) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

/** A fresh copy of the service, so its run-once guard starts clear. */
function loadService(): typeof import('@/src/services/app-check.service') {
  let service!: typeof import('@/src/services/app-check.service');
  jest.isolateModules(() => {
    service = require('@/src/services/app-check.service');
  });
  return service;
}

describe('app-check.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitializeNative.mockResolvedValue({ native: true });
  });

  describe('tokenExpiryMillis', () => {
    const now = 1_800_000_000_000;

    it('reads the exp claim', () => {
      const exp = now / 1000 + 3600;
      expect(loadService().tokenExpiryMillis(jwt({ exp }), now)).toBe(exp * 1000);
    });

    it('falls back to a short TTL for a token it cannot read', () => {
      expect(loadService().tokenExpiryMillis('not-a-jwt', now)).toBe(now + 5 * 60 * 1000);
    });

    it('falls back rather than reporting a token as already expired', () => {
      expect(loadService().tokenExpiryMillis(jwt({ exp: now / 1000 - 1 }), now)).toBe(
        now + 5 * 60 * 1000,
      );
    });
  });

  describe('startAppCheck', () => {
    it('uses the debug provider in a dev build, with the registered token', () => {
      loadService().startAppCheck(JS_APP, { debugToken: 'debug-token' });

      // __DEV__ is true under Jest.
      expect(mockConfigure).toHaveBeenCalledWith({
        android: { provider: 'debug', debugToken: 'debug-token' },
        apple: { provider: 'debug', debugToken: 'debug-token' },
      });
      expect(mockInitializeNative).toHaveBeenCalledWith(
        NATIVE_APP,
        expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
      );
    });

    it('gives the JS SDK a provider that hands over the native token', async () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = jwt({ exp });
      mockGetNativeToken.mockResolvedValue({ token });

      loadService().startAppCheck(JS_APP);

      expect(mockInitializeJsAppCheck).toHaveBeenCalledWith(
        JS_APP,
        expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
      );
      const { getToken } = mockCustomProvider.mock.calls[0][0];
      await expect(getToken()).resolves.toEqual({ token, expireTimeMillis: exp * 1000 });
      expect(mockGetNativeToken).toHaveBeenCalledWith({ native: true });
    });

    it('starts only once, since App Check can be initialised once per app', () => {
      const service = loadService();
      service.startAppCheck(JS_APP);
      service.startAppCheck(JS_APP);

      expect(mockInitializeNative).toHaveBeenCalledTimes(1);
      expect(mockInitializeJsAppCheck).toHaveBeenCalledTimes(1);
    });

    it('leaves the app running without tokens when the native module is missing', () => {
      // What an OTA bundle sees on a dev client built before App Check was added.
      mockGetNativeApp.mockImplementationOnce(() => {
        throw new Error('Native module not linked');
      });

      expect(() => loadService().startAppCheck(JS_APP)).not.toThrow();
      expect(mockInitializeNative).not.toHaveBeenCalled();
      expect(mockInitializeJsAppCheck).not.toHaveBeenCalled();
    });
  });
});
