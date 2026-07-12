# Onboarding Performance Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut new-user onboarding from ~8s blocked signup + 30s verify wait to <2s signup navigation + immediate home landing, and eliminate render-time waste in chat and home screens.

**Architecture:** Move the natal chart calculation and AI trigger chain out of the signup critical path into a fire-and-forget background service (`signup-tasks.service.ts`). Remove the horoscope readiness gate from verify-email. Memoize expensive per-render computations in chat and home screens using `useMemo`, `React.memo`, and an extracted `useChatMetrics` hook.

**Tech Stack:** React Native, Expo Router, Firebase Firestore, react-native-swisseph (Swiss Ephemeris native module), Jest + ts-jest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/services/signup-tasks.service.ts` | **Create** | Background natal chart calc + AI trigger chain; isolated and testable |
| `src/services/__tests__/signup-tasks.service.test.ts` | **Create** | Unit tests for background chain ordering and error handling |
| `src/hooks/use-chat-metrics.ts` | **Create** | Memoized question counting hook with exported pure function |
| `src/hooks/__tests__/use-chat-metrics.test.ts` | **Create** | Unit tests for question counting logic |
| `app/(auth)/sign-up.tsx` | **Modify** | Parallelize auth steps, defer background work, remove 30s timeout |
| `app/(auth)/verify-email.tsx` | **Modify** | Remove horoscope gate, 30s fallback, and loading screen branch |
| `app/(main)/chat.tsx` | **Modify** | Apply `useChatMetrics`, `useMemo` chartSummary, `React.memo` MessageBubble |
| `app/(main)/index.tsx` | **Modify** | `useMemo` for sign derivations and retrograde filter |

---

## Task 1: Add Performance Baseline Instrumentation

> Capture timings for each sequential step **before** any code changes. Commit so you can see the delta in git history.

**Files:**
- Modify: `app/(auth)/sign-up.tsx`

- [ ] **Step 1: Add `console.time` markers around each sequential await in `handleComplete`**

  In `app/(auth)/sign-up.tsx`, replace the body of `handleComplete` (starting from the `Events.signUp('email')` line through `router.replace`) with the instrumented version below. Leave the `signUp` try/catch block and all error handling unchanged.

  ```typescript
  Events.signUp('email');

  // Step 2 — Update display name
  setLoadingMessage('Setting up your profile...');
  console.time('[signup] updateProfile');
  await updateProfile(userCred.user, { displayName });
  console.timeEnd('[signup] updateProfile');

  // Step 3 — Create Firestore user document
  const payload: FinalSignupPayload = {
    email: trimmedEmail,
    name: displayName,
    fullName: displayName,
    birthday: normalizeBirthday(answers.birthday),
    birthtime: answers.birthtime ?? null,
    birthTimezone: typeof answers.birthTimezone === 'number' ? answers.birthTimezone : 0,
    birthLat: answers.birthLat ?? FALLBACK_LAT,
    birthLon: answers.birthLon ?? FALLBACK_LON,
    placeOfBirth: answers.placeOfBirth ?? null,
    isBirthTimeUnknown: answers.isBirthTimeUnknown ?? !answers.birthtime,
    isPlaceOfBirthUnknown: answers.isPlaceOfBirthUnknown ?? !answers.placeOfBirth,
    themeKey: 'default',
    profileImageId: 'profile8',
    ...(() => { const { password: _pw, ...rest } = answers; return rest; })(),
  };
  console.time('[signup] createUserDoc');
  await createUserDoc(userCred.user.uid, payload);
  console.timeEnd('[signup] createUserDoc');

  // Step 4 — Calculate natal chart
  setLoadingMessage('Calculating your birth chart...');
  const [year, month, day] = normalizeBirthday(answers.birthday).split('-').map(Number);
  const [hour, minute] = payload.birthtime
    ? payload.birthtime.split(':').map(Number)
    : [12, 0];
  const bd: BirthData = {
    year, month, day, hour, minute,
    lat: payload.birthLat,
    lon: payload.birthLon,
    timezone: payload.birthTimezone,
  };
  console.time('[signup] calculateNatalChart');
  const natalChart = await calculateNatalChart(bd);
  console.timeEnd('[signup] calculateNatalChart');
  Events.birthChartGenerated({ has_time: !payload.isBirthTimeUnknown });
  const chartPlanets = natalChart.planets.map(({ name, symbol, longitude, sign, signSymbol, degree, minutes, seconds, speed, isRetrograde, house }) =>
    ({ name, symbol, longitude, sign, signSymbol, degree, minutes, seconds, speed, isRetrograde, house })
  );
  const chartPayload = {
    createdAt: serverTimestamp(),
    planets: chartPlanets,
    houses: natalChart.houses,
    moon: natalChart.moon,
    ascendant: natalChart.ascendant,
    midheaven: natalChart.midheaven,
  };
  console.time('[signup] setDoc-birthChart');
  await setDoc(doc(db, 'users', userCred.user.uid, 'birthChart', 'data'), chartPayload);
  console.timeEnd('[signup] setDoc-birthChart');

  // Step 5 — Trigger AI generation (fire and forget)
  const chartDetailsDoc: NatalChartDetailsDoc = {
    createdAt: null as any,
    planets: chartPlanets,
    houses: natalChart.houses,
    moon: natalChart.moon,
    ascendant: natalChart.ascendant,
    midheaven: natalChart.midheaven,
  };
  const uid = userCred.user.uid;
  const dateId     = getTodayDateId();
  const weekDateId = getThisWeekDateId();

  calculateTransits(new Date(), bd.lat, bd.lon)
    .then(transits => {
      const RETROGRADE_PLANETS = new Set(['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']);
      const retrogrades = transits.planets.filter(p => p.isRetrograde && RETROGRADE_PLANETS.has(p.name)).map(p => p.name);
      requestTransitReading(uid, weekDateId, chartDetailsDoc, transits).catch(console.error);
      return requestHoroscope(uid, dateId, chartDetailsDoc, transits.moon, retrogrades);
    })
    .catch(() => requestHoroscope(uid, dateId, chartDetailsDoc, natalChart.moon))
    .then(() => requestBreakdown(uid, chartDetailsDoc))
    .catch(console.error);

  console.log('[signup] Navigating to verify-email (total blocking time above)');
  setIsLoading(false);
  setIsSigningUp(false);
  router.replace('/(auth)/verify-email');
  ```

- [ ] **Step 2: Commit the instrumentation**

  ```bash
  git add app/\(auth\)/sign-up.tsx
  git commit -m "perf: add temporary baseline instrumentation to sign-up flow"
  ```

- [ ] **Step 3: Record baseline timings**

  Run the app on a physical device or simulator. Create a new account and note the Metro/device log output:
  ```
  [signup] updateProfile: Xms
  [signup] createUserDoc: Xms
  [signup] calculateNatalChart: Xms
  [signup] setDoc-birthChart: Xms
  [signup] Navigating to verify-email (total blocking time above)
  ```
  Write these numbers down — you'll compare against them after Task 3.

---

## Task 2: Create `signup-tasks.service.ts` — Write Failing Tests First

**Files:**
- Create: `src/services/__tests__/signup-tasks.service.test.ts`
- Create: `src/services/signup-tasks.service.ts`

- [ ] **Step 1: Create the test file**

  Create `src/services/__tests__/signup-tasks.service.test.ts`:

  ```typescript
  import { runBackgroundSignupTasks } from '@/src/services/signup-tasks.service';
  import { calculateNatalChart, calculateTransits } from '@/src/services/astroEngine';
  import { requestHoroscope, getTodayDateId } from '@/src/services/horoscope.service';
  import { requestTransitReading, getThisWeekDateId } from '@/src/services/transit-reading.service';
  import { requestBreakdown } from '@/src/services/natal-chart-breakdown.service';
  import { doc, setDoc } from 'firebase/firestore';
  import { recordError } from '@/src/services/crashlytics.service';

  jest.mock('@/src/services/astroEngine');
  jest.mock('@/src/services/horoscope.service');
  jest.mock('@/src/services/transit-reading.service');
  jest.mock('@/src/services/natal-chart-breakdown.service');
  jest.mock('@/src/services/analytics.service', () => ({
    Events: { birthChartGenerated: jest.fn() },
  }));
  jest.mock('@/src/services/crashlytics.service');
  jest.mock('firebase/firestore', () => ({
    doc: jest.fn(() => ({ _docRef: true })),
    setDoc: jest.fn().mockResolvedValue(undefined),
    serverTimestamp: jest.fn(() => ({ _type: 'serverTimestamp' })),
  }));
  jest.mock('@/firebaseConfig', () => ({ db: {} }));

  const mockNatalChart = {
    planets: [{
      name: 'Sun', symbol: '☉', longitude: 45.0, sign: 'Taurus', signSymbol: '♉',
      degree: 15, minutes: 0, seconds: 0, speed: 1.0, isRetrograde: false, house: 2,
    }],
    houses: { cusps: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360] },
    moon: { sign: 'Cancer', phase: 'Full Moon', illumination: 100, degree: 5 },
    ascendant: { sign: 'Aries', degree: 0 },
    midheaven: { sign: 'Capricorn', degree: 270 },
  };

  const mockTransits = {
    planets: [{ name: 'Mercury', isRetrograde: true, sign: 'Gemini', longitude: 60, degree: 0 }],
    moon: { sign: 'Leo', phase: 'Waxing Gibbous', illumination: 60, degree: 20 },
  };

  const bd = {
    year: 1990, month: 6, day: 15, hour: 12, minute: 0,
    lat: 40.71, lon: -74.01, timezone: -5,
  };

  async function flushPromises(times = 6) {
    for (let i = 0; i < times; i++) await Promise.resolve();
  }

  describe('runBackgroundSignupTasks', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (calculateNatalChart as jest.Mock).mockResolvedValue(mockNatalChart);
      (calculateTransits as jest.Mock).mockResolvedValue(mockTransits);
      (requestHoroscope as jest.Mock).mockResolvedValue(undefined);
      (requestTransitReading as jest.Mock).mockResolvedValue(undefined);
      (requestBreakdown as jest.Mock).mockResolvedValue(undefined);
      (getTodayDateId as jest.Mock).mockReturnValue('2026-05-26');
      (getThisWeekDateId as jest.Mock).mockReturnValue('2026-05-24');
    });

    it('calls calculateNatalChart with the provided BirthData', async () => {
      await runBackgroundSignupTasks('uid123', bd, false);
      expect(calculateNatalChart).toHaveBeenCalledWith(bd);
    });

    it('writes the birth chart to Firestore at users/{uid}/birthChart/data', async () => {
      await runBackgroundSignupTasks('uid123', bd, false);
      expect(doc).toHaveBeenCalledWith({}, 'users', 'uid123', 'birthChart', 'data');
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ planets: expect.any(Array) }),
      );
    });

    it('calls requestHoroscope after the birth chart is written', async () => {
      await runBackgroundSignupTasks('uid123', bd, false);
      await flushPromises();
      expect(requestHoroscope).toHaveBeenCalled();
    });

    it('calls requestBreakdown after requestHoroscope resolves', async () => {
      await runBackgroundSignupTasks('uid123', bd, false);
      await flushPromises();
      expect(requestBreakdown).toHaveBeenCalled();
    });

    it('calls requestTransitReading with the correct uid and weekDateId', async () => {
      await runBackgroundSignupTasks('uid123', bd, false);
      await flushPromises();
      expect(requestTransitReading).toHaveBeenCalledWith(
        'uid123', '2026-05-24', expect.anything(), mockTransits,
      );
    });

    it('resolves without throwing when calculateNatalChart fails', async () => {
      (calculateNatalChart as jest.Mock).mockRejectedValue(new Error('ephemeris failure'));
      await expect(runBackgroundSignupTasks('uid123', bd, false)).resolves.toBeUndefined();
    });

    it('calls recordError with the correct label when calculateNatalChart fails', async () => {
      const err = new Error('ephemeris failure');
      (calculateNatalChart as jest.Mock).mockRejectedValue(err);
      await runBackgroundSignupTasks('uid123', bd, false);
      expect(recordError).toHaveBeenCalledWith(err, 'signup_background_chart');
    });

    it('does not call setDoc when calculateNatalChart fails', async () => {
      (calculateNatalChart as jest.Mock).mockRejectedValue(new Error('ephemeris failure'));
      await runBackgroundSignupTasks('uid123', bd, false);
      expect(setDoc).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: Run the tests — expect them to FAIL (file not yet created)**

  ```bash
  npx jest src/services/__tests__/signup-tasks.service.test.ts --no-coverage
  ```

  Expected output: `Cannot find module '@/src/services/signup-tasks.service'`

- [ ] **Step 3: Create `src/services/signup-tasks.service.ts`**

  ```typescript
  import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

  import { db } from '@/firebaseConfig';
  import { calculateNatalChart, calculateTransits, type BirthData } from '@/src/services/astroEngine';
  import { recordError } from '@/src/services/crashlytics.service';
  import { Events } from '@/src/services/analytics.service';
  import { requestBreakdown } from '@/src/services/natal-chart-breakdown.service';
  import { requestHoroscope, getTodayDateId } from '@/src/services/horoscope.service';
  import { requestTransitReading, getThisWeekDateId } from '@/src/services/transit-reading.service';
  import type { NatalChartDetailsDoc } from '@/src/types/user.type';

  export type { BirthData };

  const RETROGRADE_PLANETS = new Set([
    'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
  ]);

  /**
   * Runs after sign-up navigation as a non-awaited background chain.
   * Computes the natal chart via Swiss Ephemeris, writes birthChart/data to
   * Firestore, then triggers AI generation for horoscope, transit reading, and breakdown.
   *
   * Never rejects — all errors are caught and sent to Crashlytics.
   * horoscope-context handles the "no chart yet" recovery path if this fails.
   */
  export async function runBackgroundSignupTasks(
    uid: string,
    bd: BirthData,
    isBirthTimeUnknown: boolean,
  ): Promise<void> {
    try {
      const natalChart = await calculateNatalChart(bd);
      Events.birthChartGenerated({ has_time: !isBirthTimeUnknown });

      const chartPlanets = natalChart.planets.map(({
        name, symbol, longitude, sign, signSymbol,
        degree, minutes, seconds, speed, isRetrograde, house,
      }) => ({
        name, symbol, longitude, sign, signSymbol,
        degree, minutes, seconds, speed, isRetrograde, house,
      }));

      await setDoc(doc(db, 'users', uid, 'birthChart', 'data'), {
        createdAt: serverTimestamp(),
        planets: chartPlanets,
        houses: natalChart.houses,
        moon: natalChart.moon,
        ascendant: natalChart.ascendant,
        midheaven: natalChart.midheaven,
      });

      const chartDetailsDoc: NatalChartDetailsDoc = {
        createdAt: null as any,
        planets: chartPlanets,
        houses: natalChart.houses,
        moon: natalChart.moon,
        ascendant: natalChart.ascendant,
        midheaven: natalChart.midheaven,
      };

      const dateId     = getTodayDateId();
      const weekDateId = getThisWeekDateId();

      calculateTransits(new Date(), bd.lat, bd.lon)
        .then(transits => {
          const retrogrades = transits.planets
            .filter(p => p.isRetrograde && RETROGRADE_PLANETS.has(p.name))
            .map(p => p.name);
          requestTransitReading(uid, weekDateId, chartDetailsDoc, transits).catch(console.error);
          return requestHoroscope(uid, dateId, chartDetailsDoc, transits.moon, retrogrades);
        })
        .catch(() => requestHoroscope(uid, dateId, chartDetailsDoc, natalChart.moon))
        .then(() => requestBreakdown(uid, chartDetailsDoc))
        .catch(console.error);

    } catch (err) {
      recordError(err, 'signup_background_chart');
    }
  }
  ```

- [ ] **Step 4: Run the tests — expect them to PASS**

  ```bash
  npx jest src/services/__tests__/signup-tasks.service.test.ts --no-coverage
  ```

  Expected: `8 passed, 0 failed`

- [ ] **Step 5: Commit**

  ```bash
  git add src/services/signup-tasks.service.ts src/services/__tests__/signup-tasks.service.test.ts
  git commit -m "feat: extract background signup tasks to signup-tasks.service"
  ```

---

## Task 3: Restructure `sign-up.tsx` — Parallelize + Navigate Early

**Files:**
- Modify: `app/(auth)/sign-up.tsx`

- [ ] **Step 1: Update the import block**

  Replace the entire import section at the top of the file with:

  ```typescript
  import React, { useContext, useEffect, useState } from 'react';
  import {
    View,
    TouchableOpacity,
    Text,
    StyleSheet,
    ImageBackground,
    Platform,
    Modal,
    useWindowDimensions,
    TouchableWithoutFeedback,
    Keyboard,
    Alert,
  } from 'react-native';
  import { useRouter } from 'expo-router';
  import { useSafeAreaInsets } from 'react-native-safe-area-context';
  import { BlurView } from 'expo-blur';
  import { StatusBar } from 'expo-status-bar';
  import { updateProfile } from 'firebase/auth';

  import { ThemeContext } from '@/src/context/theme-context';
  import { signUp, createUserDoc } from '@/src/services/user.service';
  import { FinalSignupPayload } from '@/src/types/signup.types';
  import { runBackgroundSignupTasks } from '@/src/services/signup-tasks.service';
  import type { BirthData } from '@/src/services/astroEngine';
  import { verticalScale, scale, moderateScale } from '@/src/utils/responsive';
  import ChatFlow, { StepConfig } from '@/src/components/sign-up/chat-flow';
  import LoadingScreen from '../(util)/loading-screen';
  import { Ionicons } from '@expo/vector-icons';
  import { ThemedView } from '@/src/components/themed-view';
  import { Events } from '@/src/services/analytics.service';
  ```

- [ ] **Step 2: Remove the `isSigningUp` state and its 30-second timeout effect**

  Remove this state declaration (around line 73):
  ```typescript
  const [isSigningUp, setIsSigningUp] = useState(false);
  ```

  Remove the entire timeout `useEffect` block (lines 82–99):
  ```typescript
  // Timeout safety net
  useEffect(() => {
    if (!isSigningUp) return;
    const timeout = setTimeout(() => {
      Alert.alert(
        'Loading Issue',
        'Your account was created but some data is taking longer than expected. You can continue and verify your email.',
        [{
          text: 'Continue',
          onPress: () => {
            setIsSigningUp(false);
            setIsLoading(false);
            router.replace('/(main)');
          },
        }]
      );
    }, 30000);
    return () => clearTimeout(timeout);
  }, [isSigningUp]);
  ```

- [ ] **Step 3: Replace `handleComplete` with the parallelized + early-navigation version**

  Replace the entire `handleComplete` function with:

  ```typescript
  const handleComplete = async (answers: Record<string, any>) => {
    setIsLoading(true);
    setLoadingMessage('Creating your account...');

    try {
      const { firstName, lastName, email, password } = answers;
      const trimmedEmail = String(email ?? '').trim();
      const displayName = [firstName, lastName].filter(Boolean).join(' ');

      // Step 1 — Create Auth user (must be first — generates userCred)
      let userCred;
      try {
        userCred = await signUp(trimmedEmail, password);
      } catch (err: any) {
        setIsLoading(false);
        if (err?.code === 'auth/email-already-in-use') {
          const emailStepIdx = steps.findIndex(s => s.key === 'email');
          if (emailStepIdx >= 0) setStep(emailStepIdx);
          Alert.alert(
            'Email Already Registered',
            'That email is already in use. Please enter a different address or sign in.',
          );
        } else {
          Alert.alert('Sign Up Failed', parseAuthError(err));
        }
        return;
      }

      Events.signUp('email');

      // Step 2 — Build payload (needed by both parallel operations below)
      const payload: FinalSignupPayload = {
        email: trimmedEmail,
        name: displayName,
        fullName: displayName,
        birthday: normalizeBirthday(answers.birthday),
        birthtime: answers.birthtime ?? null,
        birthTimezone: typeof answers.birthTimezone === 'number' ? answers.birthTimezone : 0,
        birthLat: answers.birthLat ?? FALLBACK_LAT,
        birthLon: answers.birthLon ?? FALLBACK_LON,
        placeOfBirth: answers.placeOfBirth ?? null,
        isBirthTimeUnknown: answers.isBirthTimeUnknown ?? !answers.birthtime,
        isPlaceOfBirthUnknown: answers.isPlaceOfBirthUnknown ?? !answers.placeOfBirth,
        themeKey: 'default',
        profileImageId: 'profile8',
        ...(() => { const { password: _pw, ...rest } = answers; return rest; })(),
      };

      // Step 3 — Parallel: display name + Firestore user doc (independent, both need userCred only)
      setLoadingMessage('Setting up your profile...');
      console.time('[signup] parallel-auth');
      await Promise.all([
        updateProfile(userCred.user, { displayName }),
        createUserDoc(userCred.user.uid, payload),
      ]);
      console.timeEnd('[signup] parallel-auth');

      // Step 4 — Navigate immediately; chart calc and AI run in background
      console.log('[signup] Navigating to verify-email');
      setIsLoading(false);
      router.replace('/(auth)/verify-email');

      // Step 5 — Background: natal chart → Firestore write → AI triggers (survives navigation)
      const [year, month, day] = normalizeBirthday(answers.birthday).split('-').map(Number);
      const [hour, minute] = payload.birthtime
        ? payload.birthtime.split(':').map(Number)
        : [12, 0];
      const bd: BirthData = {
        year, month, day, hour, minute,
        lat: payload.birthLat,
        lon: payload.birthLon,
        timezone: payload.birthTimezone,
      };
      runBackgroundSignupTasks(userCred.user.uid, bd, payload.isBirthTimeUnknown);

    } catch (err: any) {
      Alert.alert('Sign Up Error', parseAuthError(err));
      setIsLoading(false);
    }
  };
  ```

- [ ] **Step 4: Run the full test suite to confirm no regressions**

  ```bash
  npx jest --no-coverage
  ```

  Expected: all tests pass.

- [ ] **Step 5: Manual regression check — sign up a new account on device/simulator**

  Observe the Metro logs. You should see:
  ```
  [signup] parallel-auth: ~Xms  (lower than updateProfile + createUserDoc combined)
  [signup] Navigating to verify-email
  ```
  The verify-email screen should appear noticeably faster than before Task 1's baseline.
  The `[signup] calculateNatalChart` timer should no longer appear before navigation.

- [ ] **Step 6: Commit**

  ```bash
  git add app/\(auth\)/sign-up.tsx
  git commit -m "perf: parallelize sign-up auth steps and defer natal chart to background"
  ```

---

## Task 4: Remove verify-email Horoscope Gate

**Files:**
- Modify: `app/(auth)/verify-email.tsx`

- [ ] **Step 1: Remove the `useHoroscope` import and its destructured values**

  Remove this import line:
  ```typescript
  import { useHoroscope } from '@/src/context/horoscope-context';
  ```

  Remove this line inside the component body:
  ```typescript
  const { horoscope, loading: dataLoading, horoscopeGenerating } = useHoroscope();
  ```

  Remove this derived value:
  ```typescript
  const horoscopeReady =
    !!horoscope || (!dataLoading && !horoscopeGenerating);
  ```

- [ ] **Step 2: Simplify the navigation effect**

  Replace:
  ```typescript
  // Navigate once verified AND AI content is ready
  useEffect(() => {
    if (verified && horoscopeReady) router.replace('/(main)');
  }, [verified, horoscopeReady]);
  ```

  With:
  ```typescript
  useEffect(() => {
    if (verified) router.replace('/(main)');
  }, [verified]);
  ```

- [ ] **Step 3: Remove the 30-second fallback effect**

  Delete the entire block:
  ```typescript
  // Safety net: if the horoscope is still generating 30s after verification,
  // navigate anyway — the main app can render with partial data and the
  // subscriptions will fill in the rest as docs arrive.
  useEffect(() => {
    if (!verified) return;
    const timeout = setTimeout(() => router.replace('/(main)'), 30000);
    return () => clearTimeout(timeout);
  }, [verified]);
  ```

- [ ] **Step 4: Remove the post-verification loading screen render branch**

  Delete:
  ```typescript
  // Still waiting for AI generation after verification
  if (verified) {
    return <LoadingScreen progress={horoscope ? 0.6 : 0.1} />;
  }
  ```

- [ ] **Step 5: Run the full test suite**

  ```bash
  npx jest --no-coverage
  ```

  Expected: all tests pass.

- [ ] **Step 6: Manual regression check — verify email on device/simulator**

  Create a fresh account or re-use one. After entering the 6-digit code and tapping Verify:
  - App should navigate to `/(main)` immediately (within ~1 second of the network call).
  - Home screen should show horoscope sections in a "generating" skeleton state if AI hasn't finished yet.
  - Within 30–60 seconds (without reloading), horoscope content should populate.

- [ ] **Step 7: Commit**

  ```bash
  git add app/\(auth\)/verify-email.tsx
  git commit -m "perf: navigate home immediately on email verification, remove horoscope gate"
  ```

---

## Task 5: Create `use-chat-metrics` Hook — Write Failing Tests First

**Files:**
- Create: `src/hooks/__tests__/use-chat-metrics.test.ts`
- Create: `src/hooks/use-chat-metrics.ts`

- [ ] **Step 1: Create the `__tests__` directory and test file**

  ```bash
  mkdir -p src/hooks/__tests__
  ```

  Create `src/hooks/__tests__/use-chat-metrics.test.ts`:

  ```typescript
  import { computeChatMetrics } from '@/src/hooks/use-chat-metrics';

  // Fixed reference point so tests are deterministic
  const NOW = new Date('2026-05-26T14:00:00.000Z');

  function makeMsg(daysAgo: number): { createdAt: Date } {
    const d = new Date(NOW);
    d.setDate(d.getDate() - daysAgo);
    return { createdAt: d };
  }

  describe('computeChatMetrics', () => {
    it('counts only today\'s active messages', () => {
      const messages = [makeMsg(0), makeMsg(0), makeMsg(1)]; // 2 today, 1 yesterday
      const { questionsUsed } = computeChatMetrics(messages, [], 10, NOW);
      expect(questionsUsed).toBe(2);
    });

    it('counts today\'s messages from saved sessions', () => {
      const sessions = [
        { messages: [makeMsg(0), makeMsg(0)] },
        { messages: [makeMsg(1)] }, // yesterday — must not count
      ];
      const { questionsUsed } = computeChatMetrics([], sessions, 10, NOW);
      expect(questionsUsed).toBe(2);
    });

    it('sums active messages and saved session messages', () => {
      const messages = [makeMsg(0)];
      const sessions = [{ messages: [makeMsg(0), makeMsg(0)] }];
      const { questionsUsed } = computeChatMetrics(messages, sessions, 10, NOW);
      expect(questionsUsed).toBe(3);
    });

    it('sets chatLocked true when used equals the limit', () => {
      const messages = [makeMsg(0), makeMsg(0)];
      const { chatLocked } = computeChatMetrics(messages, [], 2, NOW);
      expect(chatLocked).toBe(true);
    });

    it('sets chatLocked true when used exceeds the limit', () => {
      const messages = [makeMsg(0), makeMsg(0), makeMsg(0)];
      const { chatLocked } = computeChatMetrics(messages, [], 2, NOW);
      expect(chatLocked).toBe(true);
    });

    it('sets chatLocked false when under the limit', () => {
      const messages = [makeMsg(0)];
      const { chatLocked } = computeChatMetrics(messages, [], 5, NOW);
      expect(chatLocked).toBe(false);
    });

    it('clamps questionsRemaining to 0 when over limit', () => {
      const messages = [makeMsg(0), makeMsg(0), makeMsg(0)];
      const { questionsRemaining } = computeChatMetrics(messages, [], 2, NOW);
      expect(questionsRemaining).toBe(0);
    });

    it('returns correct questionsRemaining when under limit', () => {
      const messages = [makeMsg(0)];
      const { questionsRemaining } = computeChatMetrics(messages, [], 5, NOW);
      expect(questionsRemaining).toBe(4);
    });

    it('does not count yesterday\'s messages toward the limit', () => {
      const messages = [makeMsg(1), makeMsg(1)]; // all yesterday
      const { questionsUsed, chatLocked } = computeChatMetrics(messages, [], 10, NOW);
      expect(questionsUsed).toBe(0);
      expect(chatLocked).toBe(false);
    });

    it('returns questionsUsed 0 with no messages and no sessions', () => {
      const { questionsUsed } = computeChatMetrics([], [], 5, NOW);
      expect(questionsUsed).toBe(0);
    });
  });
  ```

- [ ] **Step 2: Run the tests — expect FAIL**

  ```bash
  npx jest src/hooks/__tests__/use-chat-metrics.test.ts --no-coverage
  ```

  Expected: `Cannot find module '@/src/hooks/use-chat-metrics'`

- [ ] **Step 3: Create `src/hooks/use-chat-metrics.ts`**

  ```typescript
  import { useMemo } from 'react';

  // Minimal structural types — no import from chat.service to keep this hook
  // lightweight and independently testable.
  interface MessageWithDate {
    createdAt: Date;
  }

  interface SessionWithMessages {
    messages: MessageWithDate[];
  }

  export interface ChatMetrics {
    questionsUsed: number;
    questionsRemaining: number;
    chatLocked: boolean;
  }

  /**
   * Pure computation — exported for unit tests.
   * Accepts an injectable `now` parameter so tests are fully deterministic.
   */
  export function computeChatMetrics(
    messages: MessageWithDate[],
    savedSessions: SessionWithMessages[],
    questionLimit: number,
    now: Date = new Date(),
  ): ChatMetrics {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const activeToday = messages.filter(m => m.createdAt >= todayStart).length;
    const savedToday = savedSessions.reduce(
      (n, s) => n + s.messages.filter(m => m.createdAt >= todayStart).length,
      0,
    );
    const used = activeToday + savedToday;
    return {
      questionsUsed: used,
      questionsRemaining: Math.max(0, questionLimit - used),
      chatLocked: used >= questionLimit,
    };
  }

  /**
   * Memoized hook — only recomputes when messages, savedSessions, or questionLimit changes.
   * Eliminates the O(n) filter + O(sessions × messages) reduce that previously ran on every
   * keystroke in the chat input.
   */
  export function useChatMetrics(
    messages: MessageWithDate[],
    savedSessions: SessionWithMessages[],
    questionLimit: number,
  ): ChatMetrics {
    return useMemo(
      () => computeChatMetrics(messages, savedSessions, questionLimit),
      [messages, savedSessions, questionLimit],
    );
  }
  ```

- [ ] **Step 4: Run the tests — expect PASS**

  ```bash
  npx jest src/hooks/__tests__/use-chat-metrics.test.ts --no-coverage
  ```

  Expected: `10 passed, 0 failed`

- [ ] **Step 5: Commit**

  ```bash
  git add src/hooks/use-chat-metrics.ts src/hooks/__tests__/use-chat-metrics.test.ts
  git commit -m "feat: add useChatMetrics hook with pure computeChatMetrics utility"
  ```

---

## Task 6: Apply Memoization in `chat.tsx`

**Files:**
- Modify: `app/(main)/chat.tsx`

- [ ] **Step 1: Add `useMemo` to the React import and add the hook import**

  Replace:
  ```typescript
  import React, { useCallback, useEffect, useRef, useState } from 'react';
  ```
  With:
  ```typescript
  import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
  ```

  Add after the existing local imports (after the `ChatStore` import line):
  ```typescript
  import { useChatMetrics } from '@/src/hooks/use-chat-metrics';
  ```

- [ ] **Step 2: Wrap `MessageBubble` in `React.memo`**

  Replace the function declaration (around line 103):
  ```typescript
  function MessageBubble({ msg, onRetry }: { msg: ChatMessageDoc; onRetry: (msg: ChatMessageDoc) => void }) {
  ```
  With:
  ```typescript
  const MessageBubble = React.memo(function MessageBubble({ msg, onRetry }: { msg: ChatMessageDoc; onRetry: (msg: ChatMessageDoc) => void }) {
  ```

  Add the closing `})` to match — the existing closing `}` of the function body becomes `});`.

  The complete wrapped component:
  ```typescript
  const MessageBubble = React.memo(function MessageBubble({ msg, onRetry }: { msg: ChatMessageDoc; onRetry: (msg: ChatMessageDoc) => void }) {
    const isStuck = msg.isPending && (Date.now() - msg.createdAt.getTime()) > 60_000;
    const showRetry = msg.isError || isStuck;

    return (
      <View style={styles.messageGroup}>
        {msg.connectionName ? (
          <Text style={styles.aboutTag}>about {msg.connectionName}</Text>
        ) : null}
        <View style={styles.userBubbleRow}>
          <View style={styles.userBubble}>
            <Text style={styles.userBubbleText}>{msg.userMessage}</Text>
          </View>
        </View>

        <View style={styles.aiBubbleRow}>
          <View style={styles.aiBubble}>
            {msg.isPending && !isStuck ? (
              <TypingDots />
            ) : msg.isError || isStuck ? (
              <Text style={[styles.aiBubbleText, { color: C.retro }]}>
                Something went wrong. Try again.
              </Text>
            ) : (
              <Text style={styles.aiBubbleText}>{renderRichText(msg.response ?? '')}</Text>
            )}
          </View>
          {showRetry && (
            <TouchableOpacity onPress={() => onRetry(msg)} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  });
  ```

- [ ] **Step 3: Memoize `chartSummary`**

  Replace (around line 296):
  ```typescript
  const chartSummary = chartDetails ? buildNatalChartSummary(chartDetails) : undefined;
  ```
  With:
  ```typescript
  const chartSummary = useMemo(
    () => chartDetails ? buildNatalChartSummary(chartDetails) : undefined,
    [chartDetails],
  );
  ```

- [ ] **Step 4: Replace inline question counting with `useChatMetrics`**

  Remove these lines (around lines 169–175):
  ```typescript
  // Count ALL questions sent today (active chat + saved sessions)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const activeToday = messages.filter(m => m.createdAt >= todayStart).length;
  const savedToday = savedSessions.reduce((count, session) =>
    count + session.messages.filter(m => m.createdAt >= todayStart).length, 0);
  const questionsUsed = activeToday + savedToday;
  const questionsRemaining = Math.max(0, questionLimit - questionsUsed);
  const chatLocked = questionsUsed >= questionLimit;
  ```

  Replace with:
  ```typescript
  // Count ALL questions sent today — memoized, only recomputes when messages/sessions change
  const { questionsUsed, questionsRemaining, chatLocked } = useChatMetrics(
    messages,
    savedSessions,
    questionLimit,
  );
  ```

- [ ] **Step 5: Run the full test suite**

  ```bash
  npx jest --no-coverage
  ```

  Expected: all tests pass.

- [ ] **Step 6: Manual check — open chat screen and type in the input**

  Type 10+ characters in the chat text input. The message bubbles in the FlatList should not
  visually re-render (no flicker). Confirm in Metro logs that `buildNatalChartSummary` is not
  called during typing (add a temporary `console.count('buildNatalChartSummary')` call inside
  `buildNatalChartSummary` in `natal-chart-breakdown.service.ts` — it should not increment while typing).
  Remove the `console.count` after verifying.

- [ ] **Step 7: Commit**

  ```bash
  git add app/\(main\)/chat.tsx
  git commit -m "perf: memoize chartSummary and question counting in chat screen"
  ```

---

## Task 7: Memoize `index.tsx` Derivations

**Files:**
- Modify: `app/(main)/index.tsx`

- [ ] **Step 1: Add `useMemo` to the React import**

  Replace:
  ```typescript
  import React, { useEffect, useRef, useState } from 'react';
  ```
  With:
  ```typescript
  import React, { useEffect, useMemo, useRef, useState } from 'react';
  ```

- [ ] **Step 2: Memoize the three sign derivations**

  Replace (around lines 151–153):
  ```typescript
  const sunSign    = chartDetails?.planets.find(p => p.name === 'Sun')?.sign  ?? '—';
  const moonSign   = chartDetails?.planets.find(p => p.name === 'Moon')?.sign ?? '—';
  const risingSign = chartDetails?.ascendant.sign ?? '—';
  ```
  With:
  ```typescript
  const { sunSign, moonSign, risingSign } = useMemo(() => ({
    sunSign:    chartDetails?.planets.find(p => p.name === 'Sun')?.sign  ?? '—',
    moonSign:   chartDetails?.planets.find(p => p.name === 'Moon')?.sign ?? '—',
    risingSign: chartDetails?.ascendant.sign ?? '—',
  }), [chartDetails]);
  ```

- [ ] **Step 3: Memoize the retrograde filter**

  Replace (around lines 157–159):
  ```typescript
  const noRetrogradesLabel = "No planets in retrograde";
  const filteredRetrogrades = (activeHoroscope?.planetsRetrograde ?? []).filter(p => p.toLowerCase() !== 'none');
  const retrogrades = filteredRetrogrades.length > 0 ? filteredRetrogrades : [noRetrogradesLabel];
  ```
  With:
  ```typescript
  const retrogrades = useMemo(() => {
    const filtered = (activeHoroscope?.planetsRetrograde ?? [])
      .filter(p => p.toLowerCase() !== 'none');
    return filtered.length > 0 ? filtered : ['No planets in retrograde'];
  }, [activeHoroscope?.planetsRetrograde]);
  ```

- [ ] **Step 4: Run the full test suite**

  ```bash
  npx jest --no-coverage
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add app/\(main\)/index.tsx
  git commit -m "perf: memoize sign derivations and retrograde filter in home screen"
  ```

---

## Task 8: Remove Instrumentation + Final Regression Checks

**Files:**
- Modify: `app/(auth)/sign-up.tsx`

- [ ] **Step 1: Remove all `console.time` / `console.timeEnd` / `console.log` markers from `sign-up.tsx`**

  Remove these lines from `handleComplete`:
  ```typescript
  console.time('[signup] parallel-auth');
  // ...
  console.timeEnd('[signup] parallel-auth');
  console.log('[signup] Navigating to verify-email');
  ```

- [ ] **Step 2: Run the full test suite one final time**

  ```bash
  npx jest --no-coverage
  ```

  Expected: all tests pass.

- [ ] **Step 3: Full new-user happy path regression check**

  On a physical device or simulator, create a brand new account end-to-end:

  1. Fill in all sign-up steps and tap the final confirm button.
  2. ✅ Verify-email screen appears in **under 2 seconds** from tapping confirm.
  3. Enter the 6-digit code.
  4. ✅ Home screen appears **immediately** after tapping Verify (no loading screen).
  5. ✅ Home screen shows generating/skeleton states for horoscope sections (not blank or errored).
  6. Wait 30–60 seconds without touching the app.
  7. ✅ Horoscope content populates without a reload or navigation.

- [ ] **Step 4: Existing user sign-in regression check**

  Sign in with an existing account (not a new one):
  1. ✅ Home screen loads normally with existing horoscope content.
  2. ✅ No errors or blank screens.

- [ ] **Step 5: Email change regression check on verify-email screen**

  During email verification, tap "Change email", enter a new address, tap Save:
  1. ✅ Code is resent to the new address.
  2. ✅ Entering the correct code still navigates home immediately.

- [ ] **Step 6: Final commit**

  ```bash
  git add app/\(auth\)/sign-up.tsx
  git commit -m "perf: remove temporary instrumentation, complete onboarding performance overhaul"
  ```

---

## Summary of Expected Improvements

| Metric | Before | After |
|---|---|---|
| Sign-up form submit → verify-email screen | ~8s (sequential: auth + chart calc + setDoc) | <2s (parallel auth, background chart) |
| Code verify → home screen | Up to 30s (horoscope gate) | <1s (navigate immediately) |
| `buildNatalChartSummary` calls per keystroke | 1 per keystroke | 0 (memoized, only on chartDetails change) |
| Question count recalculation per keystroke | O(n) filter + O(sessions×msgs) reduce | 0 (memoized, only on messages/sessions change) |
| MessageBubble re-renders during typing | 1 per bubble per keystroke | 0 (React.memo + stable onRetry ref) |
| Sign derivation recalculations per scroll | 3 Array.find calls | 0 (memoized, only on chartDetails change) |
