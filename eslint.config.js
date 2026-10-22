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
  {
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: ['**/__tests__/**', 'src/components/app-text.tsx'],
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
          ],
        },
      ],
    },
  },
]);
