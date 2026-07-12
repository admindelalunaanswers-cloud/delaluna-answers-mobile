# Testing Guide

This document describes the unit testing setup and test suite for the Delaluna Answers Mobile app.

## Overview

The project uses **Jest** as the testing framework with **ts-jest** for TypeScript support. Unit tests are organized alongside source code in `__tests__` directories.

## Setup

### Installation

Jest and testing dependencies are already installed. To reinstall them:

```bash
npm install --legacy-peer-deps --save-dev jest @types/jest ts-jest @testing-library/react-native @testing-library/jest-native babel-jest
```

### Configuration Files

- **jest.config.js** - Jest configuration with module mapping, coverage thresholds, and paths
- **jest.setup.js** - Global test setup with Firebase mocks and other utilities

## Running Tests

### Test Commands

```bash
# Run all tests
npm test

# Run tests in watch mode (re-run on file changes)
npm test:watch

# Run tests with coverage report
npm test:coverage

# Debug tests with Node inspector
npm run test:debug
```

### Test Coverage

Coverage thresholds are configured as:
- Statements: 80%
- Branches: 80%
- Lines: 80%
- Functions: 80%

Current coverage report is displayed after running `npm test:coverage`.

## Test Structure

Tests are located in `__tests__` subdirectories adjacent to source code:

```
src/
  utils/
    __tests__/
      location.test.ts
      synastry.test.ts
      responsive.test.ts
      firestore-date.test.ts
  services/
    __tests__/
      user.service.test.ts
      tarotCache.service.test.ts
```

## Current Test Suites

### Utilities

#### location.ts
- `hasCity()` - Filter results by city-level locations (6 tests)
- `formatPlace()` - Format location display strings (5 tests)
- `getUtcOffsetHours()` - Calculate UTC offset with DST awareness (6 tests)
- `searchNominatim()` - Query Nominatim geocoding API (6 tests)
- `detectTimezoneOffset()` - Detect timezone from coordinates (6 tests)
- `formatUtcOffset()` - Format UTC offset for display (8 tests)

**Coverage:** 96.07% statements, 97.72% functions

#### synastry.ts
- `isKeySynastryPair()` - Check if aspect is a key pairing (4 tests)
- `summarizeSynastry()` - Categorize aspects by nature (5 tests)
- `scoreAspect()` - Score aspect significance (7 tests)
- `selectTopAspects()` - Curate top 5-7 aspects (8 tests)

**Coverage:** 100% statements & lines, 90.9% branches

#### responsive.ts
- `scale()` - Horizontal responsive scaling (5 tests)
- `verticalScale()` - Vertical responsive scaling (5 tests)
- `moderateScale()` - Moderate scaling with factor (8 tests)
- Integration tests for various device sizes (4 tests)

**Coverage:** 100% (all metrics)

#### firestore-date.ts
- `toDate()` - Convert various date formats to Date objects (18 tests)

**Coverage:** 100% (all metrics)

### Services

#### user.service.ts
- `revokeMyRefreshTokens()` - Revoke auth tokens (3 tests)
- `signUp()` - Create new Firebase Auth user (3 tests)
- `createNewUserDoc()` - Create blank user document (4 tests)
- `createUserDoc()` - Create user document with data (4 tests)
- `signIn()` - Sign in existing user (3 tests)

**Coverage:** 64.36% statements, 67.07% functions

#### tarotCache.service.ts
- `tarotDailyKey()` - Generate cache key for daily card (3 tests)
- `tarotHistoryKey()` - Generate cache key for history (3 tests)
- `clearTarotCache()` - Clear all tarot cache (3 tests)
- `saveDailyCardToCache()` - Save card to AsyncStorage (4 tests)
- `getDailyCardFromCache()` - Retrieve and validate cached card (7 tests)
- `appendToTarotHistory()` - Append to card history (7 tests)

**Coverage:** 100% (all metrics)

## Mocking Strategy

### Firebase Mocks

Global Firebase mocks are configured in `jest.setup.js`:

```typescript
jest.mock('firebase/auth');
jest.mock('firebase/firestore');
jest.mock('firebase/functions');
jest.mock('firebase/storage');
```

All Firebase modules are mocked to prevent actual network calls during testing.

### AsyncStorage Mock

```typescript
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
  multiRemove: jest.fn(),
}));
```

### React Native Mocks

```typescript
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter');
jest.mock('expo-constants');
jest.mock('expo-router');
jest.mock('expo-notifications');
```

## Best Practices

### Test Organization

1. **Descriptive names** - Use clear, descriptive test names that explain what is being tested
2. **Single responsibility** - Each test should verify one behavior
3. **Arrange-Act-Assert** - Structure tests with setup, execution, and verification

Example:
```typescript
it('should format place with city, state, and country', () => {
  // Arrange
  const result: NominatimResult = { ... };
  
  // Act
  const formatted = formatPlace(result);
  
  // Assert
  expect(formatted).toBe('New York, NY, United States');
});
```

### Mock Usage

1. **Use jest.fn()** for simple function mocks
2. **Mock at module level** before imports for complex mocks
3. **Clear mocks** in beforeEach() to prevent test pollution

```typescript
beforeEach(() => {
  jest.clearAllMocks();
});
```

### Error Testing

Test both success and error paths:

```typescript
it('should handle errors gracefully', async () => {
  const mockError = new Error('API error');
  (fetch as jest.Mock).mockRejectedValue(mockError);
  
  const result = await someFunction();
  
  expect(result).toBeNull();
  expect(console.warn).toHaveBeenCalled();
});
```

## Common Issues

### Module Resolution Issues

If you see `Could not locate module` errors:

1. Check `jest.config.js` moduleNameMapper configuration
2. Ensure paths use correct alias (e.g., `@/` maps to root)
3. Verify the actual file exists

### Mock Not Working

If mocks aren't being applied:

1. Mock must be declared before import
2. Use `jest.mock()` not `jest.doMock()`
3. Clear all mocks in `beforeEach()`

### AsyncStorage Errors

If AsyncStorage methods are undefined:

```typescript
// WRONG
jest.mock('@react-native-async-storage/async-storage');

// CORRECT
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  // ... other methods
}));
```

## Adding New Tests

### Step 1: Create test file

Place alongside source code in `__tests__` directory:

```
src/services/my-service.ts
src/services/__tests__/my-service.test.ts
```

### Step 2: Write tests

```typescript
import { myFunction } from '@/src/services/my-service';

describe('my-service.ts', () => {
  it('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });
});
```

### Step 3: Run and verify

```bash
npm test -- src/services/__tests__/my-service.test.ts
npm run test:coverage
```

### Step 4: Aim for coverage thresholds

Ensure statements, branches, lines, and functions all meet 80% threshold.

## Debugging Tests

### Run Single Test

```bash
npm test -- myfunction.test.ts
```

### Run Tests Matching Pattern

```bash
npm test -- --testNamePattern="should do something"
```

### Debug with Inspector

```bash
npm run test:debug
```

Then open `chrome://inspect` in Chrome DevTools.

### Verbose Output

```bash
npm test -- --verbose
```

## CI/CD Integration

To integrate tests into CI/CD pipeline:

```bash
npm test -- --coverage --watchAll=false
```

Tests must pass and coverage thresholds must be met before merging.

## Future Improvements

Areas for additional test coverage:

1. **Cloud Functions** - Tests for Firebase Functions logic
2. **Context Hooks** - Tests for UserContext, RevenueCatContext
3. **Components** - React Native component rendering tests
4. **Integration Tests** - Test interactions between multiple modules
5. **E2E Tests** - Full user flow testing with Detox or similar

## Resources

- [Jest Documentation](https://jestjs.io/)
- [ts-jest Configuration](https://kulshekhar.github.io/ts-jest/)
- [Testing Library](https://testing-library.com/)
- [React Native Testing](https://reactnative.dev/docs/testing-overview)
