import Purchases from 'react-native-purchases';

// A key for both stores, so configure() runs rather than bailing as unkeyed.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { REVENUECAT_AAS_API_KEY: 'appl_test', REVENUECAT_GPS_API_KEY: 'goog_test' } },
  },
}));

const enableAdServices = Purchases.enableAdServicesAttributionTokenCollection as jest.Mock;

/**
 * A fresh module per test: configureRevenueCat() runs once per process. The
 * platform is set inside the isolated registry, whose react-native is its own
 * copy, and that is the one the service reads.
 */
function configureOn(os: 'ios' | 'android') {
  let configured = false;
  jest.isolateModules(() => {
    Object.defineProperty(require('react-native').Platform, 'OS', { value: os, configurable: true });
    configured = require('@/src/services/revenuecat.service').configureRevenueCat();
  });
  return configured;
}

describe('configureRevenueCat — Apple Ads attribution', () => {
  beforeEach(() => jest.clearAllMocks());

  it('turns on AdServices token collection on iOS, after configure', () => {
    expect(configureOn('ios')).toBe(true);

    expect(enableAdServices).toHaveBeenCalledTimes(1);
    expect((Purchases.configure as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      enableAdServices.mock.invocationCallOrder[0],
    );
  });

  it('leaves it off on Android, where there is no Apple Ads', () => {
    expect(configureOn('android')).toBe(true);
    expect(enableAdServices).not.toHaveBeenCalled();
  });

  // A rejection must not escape as an unhandled promise or stop the app starting.
  it('survives the SDK rejecting the call', async () => {
    enableAdServices.mockReturnValueOnce(Promise.reject(new Error('not configured')));
    expect(configureOn('ios')).toBe(true);
    await Promise.resolve();
  });
});
