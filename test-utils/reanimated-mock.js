// Minimal react-native-reanimated stand-in for component tests:
//   jest.mock('react-native-reanimated', () => require('@/test-utils/reanimated-mock'));
//
// The package's own `react-native-reanimated/mock` can't be used — it ships
// untranspiled ESM, and transformIgnorePatterns leaves node_modules alone. This
// covers what the app's components call; animations resolve to their end value
// immediately, so tests see the settled layout.
const { View, Text, Image, ScrollView } = require('react-native');

const identity = (v) => v;
const easing = new Proxy({}, { get: () => (arg) => (typeof arg === 'function' ? arg : identity) });

const Animated = {
  View,
  Text,
  Image,
  ScrollView,
  createAnimatedComponent: identity,
};

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  Easing: easing,
  interpolate: (_value, _input, output) => output[output.length - 1],
  useSharedValue: (initial) => ({ value: initial }),
  useAnimatedStyle: () => ({}),
  useDerivedValue: (fn) => ({ value: fn() }),
  withTiming: (to) => to,
  withSpring: (to) => to,
  withDelay: (_ms, animation) => animation,
  withSequence: (...steps) => steps[steps.length - 1],
  withRepeat: identity,
  runOnJS: (fn) => fn,
  cancelAnimation: () => {},
};
