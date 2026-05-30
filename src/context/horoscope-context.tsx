/**
 * horoscope-context.tsx
 * Starts fetching chart + horoscope + transits as soon as authUser is set,
 * so data is ready (or in-flight) before any screen mounts.
 * Also prefetches the natal chart breakdown and transit reading in the
 * background — available when the user navigates to those screens.
 */

import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { doc, getDoc } from 'firebase/firestore';

import { db } from '@/firebaseConfig';
import { calculateTransits, type MoonData, type TransitData } from '@/src/services/astroEngine';
import { recordError } from '@/src/services/crashlytics.service';

const reportError = (label: string) => (e: unknown) => {
  console.error(label, e);
  recordError(e, label);
};
import {
  fetchHoroscope,
  getTodayDateId,
  requestHoroscope,
  requestSurroundingHoroscopes,
  rolloverHoroscope,
  subscribeToHoroscope,
} from '@/src/services/horoscope.service';
import {
  fetchBreakdown,
  requestBreakdown,
  subscribeToBreakdown,
  type BreakdownFetchResult,
} from '@/src/services/natal-chart-breakdown.service';

const RETROGRADE_PLANETS = new Set([
  'Mercury', 'Venus', 'Mars',
  'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
]);

import {
  fetchTransitReading,
  getThisWeekDateId,
  requestTransitReading,
  subscribeToTransitReading,
  type TransitFetchResult,
} from '@/src/services/transit-reading.service';
import type { HoroscopeResult } from '@/src/types/horoscope.types';
import type { NatalChartBreakdownResult } from '@/src/types/natal-chart-breakdown.types';
import type { TransitReadingResult } from '@/src/types/transit-reading.types';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';

import { useUser } from './user-context';

// ─── Transit cache ────────────────────────────────────────────────────────────
// Avoids re-running the native Swiss Ephemeris calculation across re-mounts
// (e.g. sign-out → sign-in within the same session, or rapid re-renders).
// Keyed by "YYYY-MM-DD:lat:lon" — invalidates automatically the next day.
const _transitCache = new Map<string, TransitData>();

function _transitKey(dateId: string, lat: number, lon: number) {
  return `${dateId}:${lat.toFixed(4)}:${lon.toFixed(4)}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface HoroscopeContextValue {
  chartDetails: NatalChartDetailsDoc | null;
  horoscope: HoroscopeResult | null;
  horoscopeGenerating: boolean;
  transitMoon: MoonData | null;
  transitRetrogrades: string[];
  transitReading: TransitReadingResult | null;
  transitReadingGenerating: boolean;
  breakdown: NatalChartBreakdownResult | null;
  breakdownGenerating: boolean;
  premiumBreakdown: NatalChartBreakdownResult | null;
  premiumBreakdownGenerating: boolean;
  /** true while the initial chart + horoscope fetch is in-flight */
  loading: boolean;
  refresh: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const HoroscopeContext = createContext<HoroscopeContextValue>({
  chartDetails: null,
  horoscope: null,
  horoscopeGenerating: false,
  transitMoon: null,
  transitRetrogrades: [],
  transitReading: null,
  transitReadingGenerating: false,
  breakdown: null,
  breakdownGenerating: false,
  premiumBreakdown: null,
  premiumBreakdownGenerating: false,
  loading: true,
  refresh: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function HoroscopeProvider({ children }: { children: ReactNode }) {
  const { authUser } = useUser();

  const [chartDetails, setChartDetails]                         = useState<NatalChartDetailsDoc | null>(null);
  const [horoscope, setHoroscope]                               = useState<HoroscopeResult | null>(null);
  const [horoscopeGenerating, setHoroscopeGenerating]           = useState(false);
  const [transitMoon, setTransitMoon]                           = useState<MoonData | null>(null);
  const [transitRetrogrades, setTransitRetrogrades]             = useState<string[]>([]);
  const [transitReading, setTransitReading]                     = useState<TransitReadingResult | null>(null);
  const [transitReadingGenerating, setTransitReadingGenerating] = useState(false);
  const [breakdown, setBreakdown]                               = useState<NatalChartBreakdownResult | null>(null);
  const [breakdownGenerating, setBreakdownGenerating]           = useState(false);
  const [loading, setLoading]                                   = useState(true);

  // premiumBreakdown mirrors breakdown — both come from the same single doc now
  const premiumBreakdown            = breakdown;
  const premiumBreakdownGenerating  = breakdownGenerating;

  const unsubHoroscopeRef          = useRef<(() => void) | null>(null);
  const unsubBreakdownRef          = useRef<(() => void) | null>(null);
  const unsubTransitRef            = useRef<(() => void) | null>(null);

  // Track generating flags in a ref so the AppState listener always reads fresh
  // values without needing them in its dependency array (avoids stale closures).
  const generatingRef = useRef({ breakdown: false, transit: false, horoscope: false });
  generatingRef.current.breakdown = breakdownGenerating && !breakdown;
  generatingRef.current.transit   = transitReadingGenerating && !transitReading;
  generatingRef.current.horoscope = horoscopeGenerating && !horoscope;

  // ─── Background subscribers (subscribe + request only, no re-fetch) ──────────

  const subscribeBreakdown = (
    uid: string,
    chart: NatalChartDetailsDoc,
    signal: { cancelled: boolean },
    prefetched: BreakdownFetchResult,
    pronouns: string,
  ) => {
    const { result, pending } = prefetched;

    if (result) return;

    setBreakdownGenerating(true);

    const unsub = subscribeToBreakdown(uid, (r) => {
      if (signal.cancelled) return;
      setBreakdown(r);
      setBreakdownGenerating(false);
    });
    unsubBreakdownRef.current = unsub;

    if (!pending) requestBreakdown(uid, chart, pronouns).catch(console.error);
  };

  const subscribeTransitReading = (
    uid: string,
    dateId: string,
    chart: NatalChartDetailsDoc,
    transits: TransitData,
    signal: { cancelled: boolean },
    prefetched: TransitFetchResult,
    pronouns: string,
  ) => {
    if (prefetched.result) return; // already set in state, nothing to do

    setTransitReadingGenerating(true);
    const unsub = subscribeToTransitReading(uid, dateId, (r) => {
      if (signal.cancelled) return;
      setTransitReading(r);
      setTransitReadingGenerating(false);
      unsubTransitRef.current?.();
      unsubTransitRef.current = null;
    });
    unsubTransitRef.current = unsub;

    if (!prefetched.pending) requestTransitReading(uid, dateId, chart, transits, pronouns).catch(console.error);
  };

  // ─── Main load ──────────────────────────────────────────────────────────────

  const load = async (uid: string, signal: { cancelled: boolean }) => {
    setLoading(true);
    const dateId     = getTodayDateId();
    // Transit readings are keyed by the week's Sunday so they regenerate once
    // per week. Every Sunday the key changes → a fresh reading is generated.
    const weekDateId = getThisWeekDateId();

    // Fetch user doc alongside other data so birth coordinates come from
    // Firestore — not from userDoc state — and are always correct on first load,
    // even before user-context has finished resolving its own fetch.
    const [userSnap, chartSnap, horoscopeRes, breakdownFetch, transitReadingFetch] = await Promise.all([
      getDoc(doc(db, 'users', uid)),
      getDoc(doc(db, 'users', uid, 'birthChart', 'data')),
      fetchHoroscope(uid, dateId),
      fetchBreakdown(uid),
      fetchTransitReading(uid, weekDateId),
    ]);

    const userData = userSnap.exists() ? userSnap.data() : null;
    const lat      = typeof userData?.birthLat === 'number' ? userData.birthLat : 0;
    const lon      = typeof userData?.birthLon === 'number' ? userData.birthLon : 0;
    const pronouns: string = userData?.pronouns ?? 'they/them';

    const transitKey = _transitKey(dateId, lat, lon);
    const cachedTransit = _transitCache.get(transitKey);
    const transits = cachedTransit
      ? cachedTransit
      : await calculateTransits(new Date(), lat, lon).catch(() => null);
    if (transits && !cachedTransit) _transitCache.set(transitKey, transits);

    if (signal.cancelled) return;

    const chart = chartSnap.exists() ? (chartSnap.data() as NatalChartDetailsDoc) : null;
    setChartDetails(chart);

    if (transits) {
      setTransitMoon(transits.moon);
      setTransitRetrogrades(transits.planets.filter(p => p.isRetrograde && RETROGRADE_PLANETS.has(p.name)).map(p => p.name));
    }

    // Set breakdown and transit reading immediately — no secondary loading phase
    if (breakdownFetch.result) setBreakdown(breakdownFetch.result);
    if (transitReadingFetch.result) {
      setTransitReading(transitReadingFetch.result);
    }

    setLoading(false);

    // Pre-generate tomorrow's horoscope so it's ready when the day rolls over.
    if (chart) rolloverHoroscope(uid, chart, pronouns).catch(reportError('horoscope_rollover'));

    const { result, pending } = horoscopeRes;

    // Horoscope subscribe / request
    if (result) {
      setHoroscope(result);
      // Horoscope already done — subscribe transit + breakdown, then surrounding days.
      if (chart) {
        subscribeBreakdown(uid, chart, signal, breakdownFetch, pronouns);
        if (transits) subscribeTransitReading(uid, weekDateId, chart, transits, signal, transitReadingFetch, pronouns);
        requestSurroundingHoroscopes(uid, dateId, chart, pronouns).catch(console.error);
      }
      return;
    }

    if (!chart) {
      // New user: chart hasn't been written yet. Stay in generating state so
      // AuthGate doesn't navigate early. Subscribe so we pick it up when
      // sign-up writes the horoscope and transit reading to Firestore.
      setHoroscopeGenerating(true);
      const unsubHoro = subscribeToHoroscope(uid, dateId, (r) => {
        if (signal.cancelled) return;
        setHoroscope(r);
        setHoroscopeGenerating(false);
        unsubHoroscopeRef.current?.();
        unsubHoroscopeRef.current = null;
          // The Firebase Extension requires birthChart/data to exist before it
        // can generate the horoscope, so the chart is guaranteed to be written
        // by the time this fires. Re-fetch it so chartDetails (and the 3 signs)
        // are populated on the home screen.
        getDoc(doc(db, 'users', uid, 'birthChart', 'data')).then(snap => {
          if (!signal.cancelled && snap.exists()) {
            const newChart = snap.data() as NatalChartDetailsDoc;
            setChartDetails(newChart);
            // Start breakdown subscription now that the chart exists.
            // (subscribeBreakdown was skipped in load() because chart was null
            // at fetch time — Android timing: calculateNatalChart finishes after
            // load()'s Promise.all already completed with chart=null.)
            // Re-fetch breakdown state here — sign-up's fire-and-forget chain
            // may have already written the doc between load()'s Promise.all and
            // this callback, making the captured breakdownFetch stale. Using the
            // stale snapshot would cause a second requestBreakdown call → two
            // Extension runs → two "chart ready" notifications.
            if (!unsubBreakdownRef.current) {
              fetchBreakdown(uid).then(freshBreakdownFetch => {
                if (!signal.cancelled) {
                  subscribeBreakdown(uid, newChart, signal, freshBreakdownFetch, pronouns);
                }
              }).catch(console.error);
            }
            // Generate yesterday + tomorrow now that the chart exists.
            // Without this, new users only ever get today's horoscope until
            // the next day's rollover.
            requestSurroundingHoroscopes(uid, dateId, newChart, pronouns).catch(console.error);
          }
        }).catch(console.error);
      });
      unsubHoroscopeRef.current = unsubHoro;

      setTransitReadingGenerating(true);
      const unsubTransit = subscribeToTransitReading(uid, weekDateId, (r) => {
        if (signal.cancelled) return;
        setTransitReading(r);
        setTransitReadingGenerating(false);
        unsubTransitRef.current?.();
        unsubTransitRef.current = null;
      });
      unsubTransitRef.current = unsubTransit;
      return;
    }

    setHoroscopeGenerating(true);
    const unsub = subscribeToHoroscope(uid, dateId, (r) => {
      if (signal.cancelled) return;
      setHoroscope(r);
      setHoroscopeGenerating(false);
      unsubHoroscopeRef.current?.();
      unsubHoroscopeRef.current = null;
    });
    unsubHoroscopeRef.current = unsub;

    if (!pending) {
      // Generation order: today horoscope → transit reading → breakdown → surrounding days.
      // Each write arrives at the extension in sequence so today's horoscope is processed first.
      const moon        = transits?.moon ?? chart.moon;
      const retrogrades = transits?.planets.filter(p => p.isRetrograde && RETROGRADE_PLANETS.has(p.name)).map(p => p.name) ?? [];
      requestHoroscope(uid, dateId, chart, moon, retrogrades, pronouns)
        .then(() => {
          subscribeBreakdown(uid, chart, signal, breakdownFetch, pronouns);
          if (transits) subscribeTransitReading(uid, weekDateId, chart, transits, signal, transitReadingFetch, pronouns);
          requestSurroundingHoroscopes(uid, dateId, chart, pronouns).catch(console.error);
        })
        .catch(console.error);
    } else {
      // Horoscope already in-flight — subscribe transit + breakdown now, then surrounding.
      subscribeBreakdown(uid, chart, signal, breakdownFetch, pronouns);
      if (transits) subscribeTransitReading(uid, weekDateId, chart, transits, signal, transitReadingFetch, pronouns);
      requestSurroundingHoroscopes(uid, dateId, chart, pronouns).catch(console.error);
    }
  };

  // ─── Auth effect ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authUser) {
      setChartDetails(null);
      setHoroscope(null);
      setHoroscopeGenerating(false);
      setTransitMoon(null);
      setTransitRetrogrades([]);
      setTransitReading(null);
      setTransitReadingGenerating(false);
      setBreakdown(null);
      setBreakdownGenerating(false);
      // Keep loading=true so AuthGate doesn't briefly clear between
      // the null-auth reset and the next load() call (race condition).
      setLoading(true);
      unsubHoroscopeRef.current?.(); unsubHoroscopeRef.current = null;
      unsubBreakdownRef.current?.(); unsubBreakdownRef.current = null;
      unsubTransitRef.current?.();   unsubTransitRef.current = null;
      return;
    }

    const signal = { cancelled: false };
    load(authUser.uid, signal).catch(reportError('horoscope_load'));

    return () => {
      signal.cancelled = true;
      unsubHoroscopeRef.current?.(); unsubHoroscopeRef.current = null;
      unsubBreakdownRef.current?.(); unsubBreakdownRef.current = null;
      unsubTransitRef.current?.();   unsubTransitRef.current = null;
    };
  }, [authUser?.uid]);

  // ─── App resume: re-check items still generating ───────────────────────────
  // onSnapshot listeners may miss updates if the app was suspended long enough
  // for the Firestore connection to drop. A one-time getDoc on resume fills the
  // gap so the UI never stays stuck on a loading spinner.

  useEffect(() => {
    const uid = authUser?.uid;
    if (!uid) return;

    const handleAppState = (state: AppStateStatus) => {
      if (state !== 'active') return;
      const g = generatingRef.current;

      if (g.breakdown) {
        fetchBreakdown(uid).then(({ result }) => {
          if (result) { setBreakdown(result); setBreakdownGenerating(false); }
        }).catch(console.error);
      }
      if (g.transit) {
        fetchTransitReading(uid, getThisWeekDateId()).then(({ result }) => {
          if (result) { setTransitReading(result); setTransitReadingGenerating(false); }
        }).catch(console.error);
      }
      if (g.horoscope) {
        fetchHoroscope(uid, getTodayDateId()).then(({ result }) => {
          if (result) { setHoroscope(result); setHoroscopeGenerating(false); }
        }).catch(console.error);
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [authUser?.uid]);

  // ─── Refresh ────────────────────────────────────────────────────────────────

  const refresh = async () => {
    if (!authUser) return;

    // Cancel all live listeners before re-fetching so stale callbacks don't
    // overwrite the incoming fresh data.
    unsubHoroscopeRef.current?.(); unsubHoroscopeRef.current = null;
    unsubBreakdownRef.current?.(); unsubBreakdownRef.current = null;
    unsubTransitRef.current?.();   unsubTransitRef.current = null;

    // Clear data and reset all generating flags to a known clean state.
    // Without this, a previous `breakdownGenerating = true` from an earlier
    // load could persist if the new load short-circuits (e.g. result already
    // in cache), leaving the UI stuck on a spinner indefinitely.
    setHoroscope(null);
    setHoroscopeGenerating(false);
    setBreakdown(null);
    setBreakdownGenerating(false);
    setTransitReading(null);
    setTransitReadingGenerating(false);

    const signal = { cancelled: false };
    await load(authUser.uid, signal);
  };

  return (
    <HoroscopeContext.Provider value={{
      chartDetails,
      horoscope,
      horoscopeGenerating,
      transitMoon,
      transitRetrogrades,
      transitReading,
      transitReadingGenerating,
      breakdown,
      breakdownGenerating,
      premiumBreakdown,
      premiumBreakdownGenerating,
      loading,
      refresh,
    }}>
      {children}
    </HoroscopeContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useHoroscope() {
  return useContext(HoroscopeContext);
}
