# Test Suite Design — delaluna-answers-mobile

**Date:** 2026-05-26  
**Goal:** 100% coverage (statements, branches, functions, lines) across all source files except `astroEngine.ts`  
**Approach:** Risk-ranked, edge-case-first — services → contexts → stores/hooks/utils

---

## Motivation

Current state: 6 test files, 137 tests, ~7% global coverage. Coverage threshold in `jest.config.js` is set to 80% but is not met. Bugs slipping through are primarily:

- Edge cases and null/undefined inputs crashing services
- Context state not updating correctly after purchases, horoscope refreshes, or auth changes
- UI components rendering stale or wrong state

---

## Scope

### In scope — 100% coverage required

| Layer | Files |
|---|---|
| Services | `revenuecat.service.ts`, `chat.service.ts`, `horoscope.service.ts`, `transit-reading.service.ts`, `synastry-reading.service.ts`, `natal-chart-breakdown.service.ts`, `analytics.service.ts`, `crashlytics.service.ts`, `performance.service.ts`, `notifications.service.ts`, `secure-auth-storage.ts`, `connection-context.service.ts`, `connections-cache.service.ts`, `tarot-card.service.ts` |
| Contexts | `horoscope-context.tsx`, `revenuecat-context.tsx`, `admin-context.tsx`, `user-context.tsx`, `theme-context.tsx` |
| Stores | `chat-store.ts`, `navigation-store.ts` |
| Hooks | `use-theme.ts`, `use-theme-color.ts`, `use-color-scheme.ts`, `use-responsive.ts`, `use-pull-to-refresh.ts`, `use-min-version.ts` |
| Utils | `layout.ts`, `rich-text.tsx` |

### Excluded from coverage collection

| File | Reason |
|---|---|
| `astroEngine.ts` | Wraps `react-native-swisseph` native binary — astrological accuracy cannot be verified through mocks; any fabricated test would give false confidence |

Services and contexts that import `astroEngine` will mock the entire module (`jest.mock('@/src/services/astroEngine')`) and test only their own logic.

---

## File Organization

Tests live in `__tests__/` folders next to their source, matching the existing project convention:

```
src/
  services/__tests__/
    revenuecat.service.test.ts         (new)
    chat.service.test.ts               (new)
    horoscope.service.test.ts          (new)
    transit-reading.service.test.ts    (new)
    synastry-reading.service.test.ts   (new)
    natal-chart-breakdown.service.test.ts (new)
    analytics.service.test.ts          (new)
    crashlytics.service.test.ts        (new)
    performance.service.test.ts        (new)
    notifications.service.test.ts      (new)
    secure-auth-storage.test.ts        (new)
    connection-context.service.test.ts (new)
    connections-cache.service.test.ts  (new)
    tarot-card.service.test.ts         (new)
    user.service.test.ts               (existing — extend to 100%)
    tarotCache.service.test.ts         (existing — already 100%)
  context/__tests__/
    theme-context.test.tsx             (new)
    user-context.test.tsx              (new)
    admin-context.test.tsx             (new)
    revenuecat-context.test.tsx        (new)
    horoscope-context.test.tsx         (new)
  stores/__tests__/
    chat-store.test.ts                 (new)
    navigation-store.test.ts           (new)
  hooks/__tests__/
    use-theme.test.ts                  (new)
    use-theme-color.test.ts            (new)
    use-color-scheme.test.ts           (new)
    use-responsive.test.ts             (new)
    use-pull-to-refresh.test.ts        (new)
    use-min-version.test.ts            (new)
  utils/__tests__/
    layout.test.ts                     (new)
    rich-text.test.tsx                 (new)
    firestore-date.test.ts             (existing — already 100%)
    location.test.ts                   (existing — already ~97%, extend)
    responsive.test.ts                 (existing — already 100%)
    synastry.test.ts                   (existing — already 100%)
```

---

## Per-Layer Test Design

### Layer 1: Services

Every service test file covers:
1. **Happy path** — normal inputs produce expected output
2. **Null/undefined safety** — missing Firebase fields, missing optional params, empty snapshots
3. **Error paths** — Firebase/SDK throws, all `try/catch` branches exercised
4. **Every branch** — `if/else`, ternary, `??`, `?.`, `switch`

#### Special cases

**`revenuecat.service.ts`** — module-level `_configured` state persists across tests. Solution: wrap tests that need a fresh unconfigured state in `jest.isolateModules()` or use `beforeEach` with `jest.resetModules()` to re-import fresh. Branches to cover:
- `configureRevenueCat()`: already configured → no-op; `REVENUECAT_ENABLED=false` → returns false; no API key → returns false; `__DEV__=true` → sets debug log level; first-time configure → calls `Purchases.configure`
- `logoutUser()`: already anonymous → skips `logOut`; not anonymous → calls `logOut`
- `hasEntitlement()`: active entitlement → true; absent → false; empty `active` object → false
- `onCustomerInfoUpdate()`: attaches listener; returned function calls `removeCustomerInfoUpdateListener`

**`chat.service.ts`** — private `parseResponse` function is only reachable via `subscribeToChatHistory`. Cover all branches through the public API:
- Response in `data.response` field (string)
- Response in `data.result` field (fallback)
- Response wrapped in code fences (stripped)
- Response is JSON object → extract first string value
- Response is JSON but no string value → return as-is
- `data.status.state = 'ERROR'` → `isError: true`
- Missing `response` + non-error state → `isPending: true`
- `connectionId`/`connectionName` present vs. absent

**`horoscope.service.ts`** — mock `@/src/services/astroEngine` entirely. Cover:
- `getTodayDateId()` — date formatting
- `formatDateLabel()` (covered via callers)
- `buildNatalChartSummary()` (covered via callers)
- `fetchHoroscope()`: doc exists → returns data; doc missing → returns null
- `requestHoroscope()`: deletes existing doc, writes new doc
- `subscribeToHoroscope()`: snapshot fires → callback called; unsubscribe returned
- `requestSurroundingHoroscopes()`: calls request for yesterday and tomorrow
- `rolloverHoroscope()`: existing doc found → no-op; missing → triggers request

**`secure-auth-storage.ts`** — chunking logic:
- `setItem`: short value (1 chunk); long value (multiple chunks); clears previous before writing
- `getItem`: meta missing → null; meta count is 0 or NaN → null; a chunk is null → null (partial write); all chunks present → joined string
- `removeItem`: meta present → deletes all chunks + meta; meta absent → no-op

### Layer 2: Contexts

All context tests use `renderHook` from `@testing-library/react-native`, wrapped in a `wrapper` prop providing required parent contexts.

**`revenuecat-context.tsx`**
- On mount: `configureRevenueCat` called → `getCustomerInfo` called → `isPro` derived from entitlement
- `isPro=true` when entitlement active; `isPro=false` when absent
- `devPlan='premium'` overrides `isPro` to true regardless of real subscription
- `devPlan='free'` forces `isPro=false` regardless of real subscription
- `refresh()`: re-fetches `getCustomerInfo`, updates `customerInfo` and `isPro`
- `restorePurchases()`: calls service, returns true on success
- `presentPaywall()`: `PAYWALL_RESULT.PURCHASED` → returns true; `CANCELLED` → returns false
- `presentPaywallIfNeeded()`: already pro → returns false without showing paywall
- `presentChatPackPaywall()`: offering found + purchased → `{ purchased: true, quantity: N }`; dismissed → `'dismissed'`; offering not found → `'unavailable'`
- Auth UID changes: re-runs `loginUser` with new UID; null UID → skips login
- `isDevMode=true` when `REVENUECAT_ENABLED=false`
- Customer info update listener: fires → `customerInfo` and `isPro` updated; cleanup unsubscribes

**`horoscope-context.tsx`**
- `loading=true` on mount → `loading=false` after chart fetch
- `chartDetails=null` (new user) → no crash, all derived values null/empty
- AppState transitions: `background→active` re-triggers fetch
- `refresh()`: clears `horoscopeGenerating` and re-fetches
- Transit cache: same key on second call → skips `calculateTransits`; different date/location → re-calculates
- Retrograde planets filtered correctly from transit data
- Breakdown and premium breakdown generating states

**`user-context.tsx`**
- Auth listener fires with user → `authUser` set; fires with null → `authUser` cleared
- Profile update reflected in context state

**`admin-context.tsx`**
- Admin flag: loading → true, then false. `isAdmin` true/false branches.

**`theme-context.tsx`**
- Default theme applied; `setTheme` persists and updates active theme; both 'light' and 'dark' branches

### Layer 3: Stores

**`ChatStore`** — in-memory state:
- `setInitialMessage` / `popInitialMessage`: pop returns value and clears to null; second pop returns null
- `setFromNotification` / `popFromNotification`: same pop-clears pattern
- `setPendingConnection` / `popPendingConnection`: same pattern

**`NavigationStore`** — same pop-clears pattern for all fields

### Layer 4: Hooks

All hooks tested with `renderHook`, wrapped in relevant context providers.

- `useTheme`: returns `ThemeContextType`; throws (or returns undefined) when used outside provider
- `useThemeColor`: returns correct color for 'light' and 'dark' scheme
- `useColorScheme`: returns `'light'` or `'dark'` based on system
- `useResponsive`: returns correct breakpoint values for different window sizes
- `usePullToRefresh`: `refreshing` starts false; callback sets it true then back to false on completion
- `useMinVersion`: returns true when app version ≥ min; false when below; equal version → true

### Layer 5: Utils (gap-fill)

**`layout.ts`** — all exported layout calculation functions, normal inputs and edge cases (zero, negative dimensions)

**`rich-text.tsx`** — text parsing: empty string, null/undefined, plain text, markdown-like patterns, nested elements

---

## Infrastructure Changes

### `jest.config.js`

1. Add `astroEngine.ts` to `collectCoverageFrom` exclusions:
   ```js
   '!src/services/astroEngine.ts',
   ```

2. After all tests pass, update `coverageThreshold` from `80` → `100`:
   ```js
   coverageThreshold: {
     global: {
       branches: 100,
       functions: 100,
       lines: 100,
       statements: 100,
     },
   },
   ```

### `jest.setup.js`

Add mock for `react-native-swisseph` so imports in test files that indirectly load `astroEngine` don't crash:
```js
jest.mock('react-native-swisseph', () => ({}));
```

No manual mock file needed — the empty object is sufficient since `astroEngine` itself is mocked at the test level in any file that imports it.

---

## Build Order

Tests are implemented in this sequence to maximise early bug catches:

1. **Stores** — fastest, no dependencies, confirms basic JS logic
2. **Utility gap-fill** — `layout.ts`, `rich-text.tsx`
3. **Simple services** — `secure-auth-storage`, `connections-cache`, `connection-context.service`, `tarot-card.service`, `notifications.service`
4. **Medium services** — `analytics.service`, `crashlytics.service`, `performance.service`, `revenuecat.service`
5. **Complex services** — `chat.service`, `horoscope.service`, `transit-reading.service`, `synastry-reading.service`, `natal-chart-breakdown.service`
6. **Extend existing** — `user.service` (64% → 100%)
7. **Hooks** — all 6 hooks
8. **Contexts** — `theme-context`, `user-context`, `admin-context`, `revenuecat-context`, `horoscope-context`

---

## Success Criteria

- `npm test -- --coverage` exits 0
- All coverage metrics (statements, branches, functions, lines) report 100% for all in-scope files
- `astroEngine.ts` absent from coverage report
- All existing 137 tests continue to pass
- No new `jest.mock` calls added to `jest.setup.js` beyond the `react-native-swisseph` stub
