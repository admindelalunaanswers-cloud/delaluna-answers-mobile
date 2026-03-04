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
import {
  fetchHoroscope,
  getTodayDateId,
  requestHoroscope,
  subscribeToHoroscope,
} from '@/src/services/horoscope.service';
import {
  fetchBreakdown,
  requestBreakdown,
  subscribeToBreakdown,
} from '@/src/services/natal-chart-breakdown.service';
import { scheduleBreakdownReadyNotification } from '@/src/services/notifications.service';
import {
  fetchTransitReading,
  requestTransitReading,
  subscribeToTransitReading,
} from '@/src/services/transit-reading.service';
import type { HoroscopeResult } from '@/src/types/horoscope.types';
import type { NatalChartBreakdownResult } from '@/src/types/natal-chart-breakdown.types';
import type { TransitReadingResult } from '@/src/types/transit-reading.types';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';

import { useUser } from './user-context';

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
  const { authUser, userDoc } = useUser();

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

  const unsubHoroscopeRef = useRef<(() => void) | null>(null);
  const unsubBreakdownRef = useRef<(() => void) | null>(null);
  const unsubTransitRef   = useRef<(() => void) | null>(null);

  // ─── Background prefetchers ─────────────────────────────────────────────────

  const loadBreakdown = (
    uid: string,
    chart: NatalChartDetailsDoc,
    signal: { cancelled: boolean },
  ) => {
    fetchBreakdown(uid)
      .then(({ result, premiumResult, pending, premiumPending }) => {
        if (result) setBreakdown(result);
        if (premiumResult) setPremiumBreakdown(premiumResult);

        const needsRequest = !result && !pending || !premiumResult && !premiumPending;
        const needsFreeSubscribe    = !result;
        const needsPremiumSubscribe = !premiumResult;

        if (needsFreeSubscribe || needsPremiumSubscribe) {
          if (needsFreeSubscribe)    setBreakdownGenerating(true);
          if (needsPremiumSubscribe) setPremiumBreakdownGenerating(true);

          const unsub = subscribeToBreakdown(
            uid,
            (r) => {
              if (signal.cancelled) return;
              setBreakdown(r);
              setBreakdownGenerating(false);
              scheduleBreakdownReadyNotification().catch(console.error);
            },
            (r) => {
              if (signal.cancelled) return;
              setPremiumBreakdown(r);
              setPremiumBreakdownGenerating(false);
            },
          );
          unsubBreakdownRef.current = unsub;
        }

        if (needsRequest) requestBreakdown(uid, chart).catch(console.error);
      })
      .catch(console.error);
  };

  const loadTransitReading = (
    uid: string,
    dateId: string,
    chart: NatalChartDetailsDoc,
    transits: TransitData,
    signal: { cancelled: boolean },
  ) => {
    fetchTransitReading(uid, dateId)
      .then(({ result, pending }) => {
        if (signal.cancelled) return;
        if (result) { setTransitReading(result); return; }

        setTransitReadingGenerating(true);
        const unsub = subscribeToTransitReading(uid, dateId, (r) => {
          if (signal.cancelled) return;
          setTransitReading(r);
          setTransitReadingGenerating(false);
          unsubTransitRef.current?.();
          unsubTransitRef.current = null;
        });
        unsubTransitRef.current = unsub;

        if (!pending) requestTransitReading(uid, dateId, chart, transits).catch(console.error);
      })
      .catch(console.error);
  };

  // ─── Main load ──────────────────────────────────────────────────────────────

  const load = async (uid: string, signal: { cancelled: boolean }) => {
    setLoading(true);
    const dateId = getTodayDateId();
    const lat = userDoc?.birthLat ?? 0;
    const lon = userDoc?.birthLon ?? 0;

    // All three fetches fire simultaneously — no waterfall
    const [chartSnap, { result, pending }, transits] = await Promise.all([
      getDoc(doc(db, 'users', uid, 'natalChart', 'details')),
      fetchHoroscope(uid, dateId),
      calculateTransits(new Date(), lat, lon).catch(() => null),
    ]);

    if (signal.cancelled) return;

    const chart = chartSnap.exists() ? (chartSnap.data() as NatalChartDetailsDoc) : null;
    setChartDetails(chart);

    if (transits) {
      setTransitMoon(transits.moon);
      setTransitRetrogrades(transits.planets.filter(p => p.isRetrograde).map(p => p.name));
    }

    setLoading(false);

    // Kick off background prefetches — home screen doesn't need these
    if (chart) {
      loadBreakdown(uid, chart, signal);
      if (transits) loadTransitReading(uid, dateId, chart, transits, signal);
    }

    // Horoscope subscribe / request
    if (result) { setHoroscope(result); return; }
    if (!chart) return;

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
      requestHoroscope(uid, dateId, chart, moon, retrogrades).catch(console.error);
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
