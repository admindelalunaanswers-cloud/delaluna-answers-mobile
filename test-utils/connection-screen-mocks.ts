// Module mocks shared by the New / Edit Connection screen tests. Import this
// file first in a test — it only registers jest.mock calls, and babel-jest
// hoists those within this module, ahead of the screen's imports.
jest.mock('@/firebaseConfig', () => ({ db: {}, functions: {} }));
jest.mock('@/src/context/theme-context', () => {
  const { createContext } = jest.requireActual('react');
  return { ThemeContext: createContext({ theme: { backgroundImage: 1 } }) };
});
jest.mock('@/src/services/astroEngine', () => ({ calculateNatalChart: jest.fn() }));
jest.mock('@/src/prompts/compatibility-prompt', () => ({ buildCompatibilityPrompt: jest.fn(() => '') }));
jest.mock('@/src/services/analytics.service', () => ({ Events: { connectionCreated: jest.fn() } }));
jest.mock('@/src/services/performance.service', () => ({ measure: jest.fn((_n: string, fn: () => unknown) => fn()) }));
jest.mock('@/src/services/crashlytics.service', () => ({ recordError: jest.fn() }));
jest.mock('@/src/utils/location', () => ({
  searchNominatim: jest.fn(() => Promise.resolve([])),
  formatPlace: (r: { display_name: string }) => r.display_name,
  detectTimezoneOffset: jest.fn(() => Promise.resolve(0)),
}));
jest.mock('@/src/components/shared/header-nav', () => () => null);
jest.mock('@/src/components/shared/signs-display.component', () => () => null);
jest.mock('@/app/(util)/loading-screen', () => () => null);
jest.mock('@/src/components/themed-view', () => {
  const { View } = require('react-native');
  return { ThemedView: View };
});
jest.mock('@/src/components/themed-text', () => {
  const { Text } = require('react-native');
  return { ThemedText: Text };
});
jest.mock('lottie-react-native', () => () => null);
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// jest.setup.js mocks NativeEventEmitter, so Keyboard.addListener returns
// undefined and KeyboardAvoidingView throws removing it on unmount.
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View };
});

export {};
