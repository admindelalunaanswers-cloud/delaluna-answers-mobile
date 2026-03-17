/**
 * horoscope-context.tsx
 * Starts fetching chart + horoscope + transits as soon as authUser is set,
 * so data is ready (or in-flight) before any screen mounts.
 * Also prefetches the natal chart breakdown and transit reading in the
 * background — available when the user navigates to those screens.
 */

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';

import { doc, getDoc } from 'firebase/firestore';

import { db } from '@/firebaseConfig';
import { calculateTransits, type MoonData, type TransitData } from '@/src/services/astroEngine';

const RETROGRADE_PLANETS = new Set([
  'Mercury', 'Venus', 'Mars',
  'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
]);
import {
  fetchHoroscope,
  getTodayDateId,
  requestHoroscope,
  rolloverHoroscope,
  subscribeToHoroscope,
} from '@/src/services/horoscope.service';
import {
  fetchBreakdown,
  requestBreakdown,
  subscribeToBreakdown,
  type BreakdownFetchResult,
} from '@/src/services/natal-chart-breakdown.service';
import { scheduleTransitReadyNotification } from '@/src/services/notifications.service';
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
  const [premiumBreakdown, setPremiumBreakdown]                 = useState<NatalChartBreakdownResult | null>(null);
  const [premiumBreakdownGenerating, setPremiumBreakdownGenerating] = useState(false);
  const [loading, setLoading]                                   = useState(true);

  const unsubHoroscopeRef          = useRef<(() => void) | null>(null);
  const unsubBreakdownRef          = useRef<(() => void) | null>(null);
  const unsubTransitRef            = useRef<(() => void) | null>(null);
  const transitNotificationSent = useRef(false);

  // ─── Background subscribers (subscribe + request only, no re-fetch) ──────────

  const subscribeBreakdown = (
    uid: string,
    chart: NatalChartDetailsDoc,
    signal: { cancelled: boolean },
    prefetched: BreakdownFetchResult,
    pronouns: string,
  ) => {
    const { result, premiumResult, pending, premiumPending } = prefetched;
    const needsFreeSubscribe    = !result;
    const needsPremiumSubscribe = !premiumResult;
    const needsRequest = (!result && !pending) || (!premiumResult && !premiumPending);

    if (!needsFreeSubscribe && !needsPremiumSubscribe) return;

    if (needsFreeSubscribe)    setBreakdownGenerating(true);
    if (needsPremiumSubscribe) setPremiumBreakdownGenerating(true);

    const unsub = subscribeToBreakdown(
      uid,
      (r) => {
        if (signal.cancelled) return;
        setBreakdown(r);
        setBreakdownGenerating(false);
      },
      (r) => {
        if (signal.cancelled) return;
        setPremiumBreakdown(r);
        setPremiumBreakdownGenerating(false);
      },
    );
    unsubBreakdownRef.current = unsub;

    if (needsRequest) requestBreakdown(uid, chart, pronouns).catch(console.error);
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
      if (!transitNotificationSent.current) {
        transitNotificationSent.current = true;
        scheduleTransitReadyNotification().catch(console.error);
      }
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
      getDoc(doc(db, 'users', uid, 'natalChart', 'details')),
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
    if (breakdownFetch.premiumResult) setPremiumBreakdown(breakdownFetch.premiumResult);
    if (transitReadingFetch.result) setTransitReading(transitReadingFetch.result);

    setLoading(false);

    // Subscribe for data still being generated + background triggers
    if (chart) {
      subscribeBreakdown(uid, chart, signal, breakdownFetch, pronouns);
      if (transits) subscribeTransitReading(uid, weekDateId, chart, transits, signal, transitReadingFetch, pronouns);
      // Pre-generate tomorrow's horoscope so it's ready when the day rolls over.
      rolloverHoroscope(uid, chart, pronouns).catch(console.error);
    }

    const { result, pending } = horoscopeRes;

    // Horoscope subscribe / request
    if (result) { setHoroscope(result); return; }
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
        // The Firebase Extension requires natalChart/details to exist before it
        // can generate the horoscope, so the chart is guaranteed to be written
        // by the time this fires. Re-fetch it so chartDetails (and the 3 signs)
        // are populated on the home screen.
        getDoc(doc(db, 'users', uid, 'natalChart', 'details')).then(snap => {
          if (!signal.cancelled && snap.exists()) {
            setChartDetails(snap.data() as NatalChartDetailsDoc);
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
      const moon        = transits?.moon ?? chart.moon;
      const retrogrades = transits?.planets.filter(p => p.isRetrograde).map(p => p.name) ?? [];
      requestHoroscope(uid, dateId, chart, moon, retrogrades, pronouns).catch(console.error);
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
      setPremiumBreakdown(null);
      setPremiumBreakdownGenerating(false);
      // Keep loading=true so AuthGate doesn't briefly clear between
      // the null-auth reset and the next load() call (race condition).
      setLoading(true);
      unsubHoroscopeRef.current?.(); unsubHoroscopeRef.current = null;
      unsubBreakdownRef.current?.(); unsubBreakdownRef.current = null;
      unsubTransitRef.current?.();   unsubTransitRef.current = null;
      return;
    }

    const signal = { cancelled: false };
    load(authUser.uid, signal).catch(console.error);

    return () => {
      signal.cancelled = true;
      unsubHoroscopeRef.current?.(); unsubHoroscopeRef.current = null;
      unsubBreakdownRef.current?.(); unsubBreakdownRef.current = null;
      unsubTransitRef.current?.();   unsubTransitRef.current = null;
    };
  }, [authUser?.uid]);

  // ─── Refresh ────────────────────────────────────────────────────────────────

  const refresh = async () => {
    if (!authUser) return;
    unsubHoroscopeRef.current?.(); unsubHoroscopeRef.current = null;
    unsubBreakdownRef.current?.(); unsubBreakdownRef.current = null;
    unsubTransitRef.current?.();   unsubTransitRef.current = null;
    setHoroscope(null);
    setBreakdown(null);
    setPremiumBreakdown(null);
    setTransitReading(null);
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
