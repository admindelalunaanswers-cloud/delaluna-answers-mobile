// Jest setup and global configuration
import '@testing-library/jest-native/extend-expect';

// Mock Firebase
jest.mock('firebase/app', () => ({
  getApp: jest.fn(),
  initializeApp: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock('firebase/firestore', () => {
  class FakeTimestamp {
    constructor(seconds, nanoseconds = 0) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
    static now() { return new FakeTimestamp(Math.floor(Date.now() / 1000)); }
    static fromDate(d) { return new FakeTimestamp(Math.floor(d.getTime() / 1000)); }
    toDate() { return new Date(this.seconds * 1000 + this.nanoseconds / 1e6); }
    toMillis() { return this.seconds * 1000 + this.nanoseconds / 1e6; }
  }
  return {
    getFirestore: jest.fn(),
    collection: jest.fn((..._args) => ({ __type: 'collection', path: _args.slice(1).join('/') })),
    doc: jest.fn((..._args) => ({ __type: 'doc', path: _args.slice(1).join('/') })),
    getDoc: jest.fn(),
    setDoc: jest.fn(),
    addDoc: jest.fn(),
    updateDoc: jest.fn(),
    deleteDoc: jest.fn(),
    query: jest.fn((...args) => ({ __type: 'query', args })),
    where: jest.fn(),
    orderBy: jest.fn(),
    getDocs: jest.fn(),
    onSnapshot: jest.fn(),
    writeBatch: jest.fn(),
    serverTimestamp: jest.fn(() => '__SERVER_TIMESTAMP__'),
    deleteField: jest.fn(() => '__DELETE_FIELD__'),
    arrayUnion: jest.fn(),
    arrayRemove: jest.fn(),
    Timestamp: FakeTimestamp,
  };
});

jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(),
  httpsCallable: jest.fn(),
  connectFunctionsEmulator: jest.fn(),
}));

jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(),
  ref: jest.fn(),
  getBytes: jest.fn(),
  uploadBytes: jest.fn(),
}));

// Mock React Native modules
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter');

jest.mock('react-native-purchases', () => {
  const Purchases = {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    setup: jest.fn(),
    logIn: jest.fn(),
    logOut: jest.fn(),
    isAnonymous: jest.fn(),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(),
    purchasePackage: jest.fn(),
    purchaseStoreProduct: jest.fn(),
    restorePurchases: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
  };
  return {
    __esModule: true,
    default: Purchases,
    Purchases,
    LOG_LEVEL: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
  };
});

jest.mock('react-native-purchases-ui', () => ({
  __esModule: true,
  default: {
    presentPaywall: jest.fn(),
    presentPaywallIfNeeded: jest.fn(),
    presentCustomerCenter: jest.fn(),
  },
  PAYWALL_RESULT: {
    NOT_PRESENTED: 'NOT_PRESENTED',
    ERROR: 'ERROR',
    CANCELLED: 'CANCELLED',
    PURCHASED: 'PURCHASED',
    RESTORED: 'RESTORED',
  },
}));

// src/utils/logger.ts forwards errors to Crashlytics, so anything that logs an
// error pulls this native module in. Stub it so tests don't need a native host.
jest.mock('@react-native-firebase/crashlytics', () => ({
  getCrashlytics: jest.fn(() => ({})),
  crash: jest.fn(),
  log: jest.fn(),
  recordError: jest.fn(),
  setAttribute: jest.fn(),
  setAttributes: jest.fn(),
  setCrashlyticsCollectionEnabled: jest.fn(() => Promise.resolve()),
  setUserId: jest.fn(),
}));

jest.mock('expo-device', () => ({
  isDevice: true,
}));

// Accessibility constants mirror SecureStoreAccessible.swift raw values. They
// come from the native module at runtime, so they have to be stated here.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  AFTER_FIRST_UNLOCK: 0,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  ALWAYS: 2,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 3,
  ALWAYS_THIS_DEVICE_ONLY: 4,
  WHEN_UNLOCKED: 5,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
}));

// Mock Expo modules
jest.mock('expo-constants', () => ({
  Constants: {
    expoConfig: {
      version: '1.0.0',
    },
  },
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
  })),
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));

// A native view (expo-modules-core underneath), so it can't simply be
// transpiled. Stands in as a plain View — it is decoration only.
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');
  return { LinearGradient: View };
});

// Chat export (src/services/chat-export.service.ts) — all native.
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(() => Promise.resolve({ uri: 'file:///cache/print.pdf' })),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve(true)),
}));
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(() => Promise.resolve('file:///cache/card.jpg')),
}));
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  Asset: { create: jest.fn(() => Promise.resolve({})) },
}));
jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn(() => ({
      localUri: 'file:///bundle/logo.png',
      downloadAsync: jest.fn(function () {
        return Promise.resolve(this);
      }),
    })),
  },
}));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri) => ({
    uri,
    base64: jest.fn(() => Promise.resolve('TE9HTw==')),
    rename: jest.fn(),
  })),
}));

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};
