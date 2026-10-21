module.exports = {
  preset: '@react-native/jest-preset',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        rootDir: __dirname,
        // Match the app (expo/tsconfig.base: react-jsx). The classic 'react'
        // runtime made every component that uses JSX without importing React —
        // ThemedText, ThemedView, birth-chart-view — throw "React is not defined"
        // under Jest, though they build fine in the app.
        jsx: 'react-jsx',
        esModuleInterop: true,
      },
    }],
    '^.+\\.jsx?$': 'babel-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/models/**',
    '!src/types/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/build/',
    '/.expo/',
  ],
  globals: {
    'ts-jest': {
      isolatedModules: true,
    },
  },
};
