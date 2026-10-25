// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  // Text and TextInput come from src/components/app-text, which applies
  // Accessibility → Text size. react-native's would silently ignore it.
  // The status bar comes from src/components/app-status-bar: on iOS 27,
  // expo-status-bar's style changes are no-ops, and with the view-controller-based
  // Info.plist key they error.
  {
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: ['**/__tests__/**', 'src/components/app-text.tsx', 'src/components/app-status-bar.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text', 'TextInput'],
              message:
                "Import Text / TextInput from '@/src/components/app-text' so they follow Accessibility → Text size.",
            },
            {
              name: 'expo-status-bar',
              message:
                "Use AppStatusBar from '@/src/components/app-status-bar': on iOS 27 expo-status-bar's style changes do nothing.",
            },
          ],
        },
      ],
    },
  },
]);
