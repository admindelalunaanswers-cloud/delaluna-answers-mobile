# Onboarding Performance Overhaul — Design Spec

**Date:** 2026-05-26  
**Status:** Approved  
**Scope:** `app/(auth)/sign-up.tsx`, `app/(auth)/verify-email.tsx`, `app/(main)/chat.tsx`, `app/(main)/index.tsx`

---

## Problem

The new-user onboarding funnel — from submitting the sign-up form through landing on the home screen — is the slowest part of the application. Two compounding issues:

1. **Sign-up blocks navigation on expensive sequential work.** `handleComplete` runs five awaited steps before calling `router.replace`: auth creation, display name update, Firestore user doc creation, native Swiss Ephemeris natal chart calculation, and a birth chart `setDoc`. On a real device this chain takes 5–10 seconds before the user sees the verify-email screen.

2. **verify-email holds the user on a progress screen until AI generation completes.** After the user enters their code and `verifyCodeFn` succeeds, navigation is gated on `horoscopeReady` — a condition that depends on the Firebase Extension finishing the AI horoscope, which can take 10–30 seconds. The progress indicator is binary (`0.1` or `0.6`) and gives no meaningful feedback.

Secondary issues in the main app:

3. **chat.tsx recomputes expensive values on every render.** `buildNatalChartSummary` (JSON serialization), question counting (O(n) filter + reduce), and `todayStart` date construction all run on every keystroke in the text input.

4. **index.tsx recomputes derived sign values on every scroll event.** Three `Array.find` calls over the planets array and a retrograde filter run on every render.

---

## Goals

- Navigate from sign-up form completion to verify-email screen in under 2 seconds (from ~8 seconds).
- Navigate from successful code verification to home screen immediately (from up to 30 seconds).
- Eliminate render-time waste in chat and home screen.
- Maintain all existing error handling and recovery paths.
- Add performance baselines and regression tests.

---

## Non-Goals

- Moving natal chart calculation server-side (requires replacing the native Swiss Ephemeris module).
- Caching transit calculations to disk (in-memory session cache already exists in horoscope-context).
- Changing the Firebase Extension or AI generation pipeline.

---

## Architecture

### Sign-up Critical Path (sign-up.tsx)

**Before:**
```
signUp → updateProfile → createUserDoc → calculateNatalChart → setDoc(birthChart) → navigate
```

**After:**
```
signUp → Promise.all([updateProfile, createUserDoc]) → navigate → [background] calculateNatalChart → setDoc(birthChart) → fire AI triggers
```

**Details:**

- `updateProfile` and `createUserDoc` are independent after `signUp` — both only need `userCred`. Running them in `Promise.all` saves one network round-trip.
- After the parallel step resolves, clear loading state and call `router.replace('/(auth)/verify-email')` immediately.
- The `calculateNatalChart` → `setDoc(birthChart)` → AI trigger chain is started as a non-awaited `.then()` chain. JavaScript promises survive component unmount — the work continues in the event loop after navigation.
- On background chain failure: call `recordError(err, 'signup_background_chart')` and swallow. `horoscope-context` already handles the "no chart yet" new-user case (lines 250–294) — it subscribes to horoscope + transit readings and waits for the chart doc to appear, so the home screen will populate correctly once the background write eventually succeeds or a retry occurs.
- Remove the 30-second `isSigningUp` timeout `useEffect` — it becomes a no-op because `isSigningUp` is cleared before navigation.

### verify-email Navigation Gate (verify-email.tsx)

**Before:**
```typescript
const horoscopeReady = !!horoscope || (!dataLoading && !horoscopeGenerating);
useEffect(() => {
  if (verified && horoscopeReady) router.replace('/(main)');
}, [verified, horoscopeReady]);
// + 30-second fallback timer
// + if (verified) return <LoadingScreen progress={...} />
```

**After:**
```typescript
useEffect(() => {
  if (verified) router.replace('/(main)');
}, [verified]);
```

**Removals:**
- `horoscopeReady` computed value
- `useHoroscope` import and all destructured values (`horoscope`, `loading`, `horoscopeGenerating`)
- 30-second fallback `setTimeout` effect
- `if (verified) return <LoadingScreen progress={...} />` render branch

**Why it's safe:** `horoscope-context` runs at the provider level, not tied to any screen. It starts fetching and subscribing the moment `authUser` is set — before verify-email even mounts. By the time the user lands on home, the context is already in flight. Home screen sections render their existing skeleton/generating states for any content still in-flight.

### chat.tsx Render Memoization

Three changes:

**1. Memoize natal chart summary:**
```typescript
const chartSummary = useMemo(
  () => chartDetails ? buildNatalChartSummary(chartDetails) : undefined,
  [chartDetails]
);
```
Previously serialized the full natal chart object on every render (every keystroke).

**2. Memoize question counting:**
```typescript
const { questionsUsed, questionsRemaining, chatLocked } = useMemo(() => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const activeToday = messages.filter(m => m.createdAt >= todayStart).length;
  const savedToday = savedSessions.reduce(
    (n, s) => n + s.messages.filter(m => m.createdAt >= todayStart).length, 0
  );
  const used = activeToday + savedToday;
  return {
    questionsUsed: used,
    questionsRemaining: Math.max(0, questionLimit - used),
    chatLocked: used >= questionLimit,
  };
}, [messages, savedSessions, questionLimit]);
```
Previously ran O(n) filter + O(sessions × messages) reduce on every render.

**3. Memoize `MessageBubble` with `React.memo`:**
```typescript
const MessageBubble = React.memo(function MessageBubble({ msg, onRetry }) { ... });
```
`onRetry` is already `useCallback`-wrapped, so the memo correctly bails out during typing.

### index.tsx Memoization

Two `useMemo` additions:

```typescript
const { sunSign, moonSign, risingSign } = useMemo(() => ({
  sunSign:    chartDetails?.planets.find(p => p.name === 'Sun')?.sign  ?? '—',
  moonSign:   chartDetails?.planets.find(p => p.name === 'Moon')?.sign ?? '—',
  risingSign: chartDetails?.ascendant.sign ?? '—',
}), [chartDetails]);

const retrogrades = useMemo(() => {
  const filtered = (activeHoroscope?.planetsRetrograde ?? [])
    .filter(p => p.toLowerCase() !== 'none');
  return filtered.length > 0 ? filtered : ['No planets in retrograde'];
}, [activeHoroscope?.planetsRetrograde]);
```

Previously re-ran `Array.find` and filter on every scroll event.

---

## Performance Testing

### Baseline Measurements (before changes)

Capture these metrics manually before touching any code:

| Metric | How to measure | Target after |
|---|---|---|
| Sign-up form submit → verify-email screen visible | Stopwatch from tapping final step | < 2s |
| Code entry → home screen visible | Stopwatch from tapping Verify | < 1s |
| chat.tsx renders per keystroke (Flipper / React DevTools) | React DevTools Profiler | 1 render |
| `buildNatalChartSummary` call count per typing session | console.count instrumentation | 0 (memoized) |

### Instrumentation Points

Add temporary `console.time` / `console.timeEnd` markers around the sign-up critical path steps:

```typescript
console.time('signup:parallel');
await Promise.all([updateProfile(...), createUserDoc(...)]);
console.timeEnd('signup:parallel');

console.time('signup:navigate');
router.replace('/(auth)/verify-email');
console.timeEnd('signup:navigate');

// In background chain:
console.time('signup:bg:natalChart');
const natalChart = await calculateNatalChart(bd);
console.timeEnd('signup:bg:natalChart');
```

These are removed before the PR is merged — their purpose is to confirm the optimizations are working during development.

### Regression Checks

After implementing all changes, verify:

1. **New user happy path** — Create a fresh account end-to-end. Confirm:
   - Verify-email screen appears within 2 seconds of tapping the final sign-up step.
   - Entering the correct code navigates to home immediately.
   - Home screen shows generating states (not blank/errored) for horoscope sections.
   - Within 30–60 seconds, horoscope content populates without a reload.

2. **Background chart failure simulation** — Temporarily throw inside `calculateNatalChart` after navigation. Confirm:
   - `recordError` is called (visible in Crashlytics or console).
   - The app does not crash.
   - Home screen enters the "generating" state and does not show an error screen.

3. **Chat render count** — With React DevTools Profiler attached, type 10 characters in the chat input. Confirm `MessageBubble` components do not highlight (no re-renders). Confirm `buildNatalChartSummary` is not called during typing (via `console.count`).

4. **Existing user sign-in** — Sign in with an existing account. Confirm home screen loads normally and horoscope content appears (verifies no regression in `horoscope-context` load path).

5. **Email change on verify screen** — Change email on the verify-email screen and resend code. Confirm the new address receives the code and verification still navigates to home immediately.

---

## Files Changed

| File | Change type |
|---|---|
| `app/(auth)/sign-up.tsx` | Parallelize auth steps, defer chart calc + AI triggers to background, remove 30s timeout |
| `app/(auth)/verify-email.tsx` | Remove horoscope gate, remove 30s fallback, remove `useHoroscope` import |
| `app/(main)/chat.tsx` | `useMemo` for chartSummary + question counting, `React.memo` on MessageBubble |
| `app/(main)/index.tsx` | `useMemo` for sign derivations and retrograde filter |

---

## Trade-offs & Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Background `calculateNatalChart` fails silently after navigation | Low (Swiss Ephemeris is reliable) | `recordError` + horoscope-context recovery path handles missing chart |
| User navigates back from verify-email before background chain completes | Very low (verify-email has no back nav to sign-up) | Not applicable |
| `React.memo` on `MessageBubble` causes stale renders if `onRetry` reference changes | None | `onRetry` is already `useCallback` with stable deps |
| Removing `useHoroscope` from verify-email breaks a future feature that depends on it | Low | The import can be re-added independently; the removal is isolated |
