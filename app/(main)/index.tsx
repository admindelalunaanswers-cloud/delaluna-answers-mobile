import React, { useCallback, useEffect, useRef, useState } from 'react';

import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { doc, getDoc } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { calculateTransits } from '@/src/services/astroEngine';
import type { MoonData } from '@/src/services/astroEngine';

import DateSwitcher from '@/src/components/home/date-switcher.component';
import HomeTextBox from '@/src/components/home/home-text-box.component';
import HeaderNav from '@/src/components/shared/header-nav';
import HomeSignsDisplay from '@/src/components/shared/signs-display.component';
import SectionTitle from '@/src/components/shared/section-title.component';
import { ThemedView } from '@/src/components/themed-view';
import { db } from '@/firebaseConfig';
import { useResponsive } from '@/src/hooks/use-responsive';
import { usePullToRefresh } from '@/src/hooks/use-pull-to-refresh';
import {
  fetchHoroscope,
  getTodayDateId,
  requestHoroscope,
  subscribeToHoroscope,
} from '@/src/services/horoscope.service';
import type { HoroscopeResult } from '@/src/types/horoscope.types';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';
import { useUser } from '@/src/context/user-context';

import LoadingScreen from '../(util)/loading-screen';

const NAV_BAR_HEIGHT = 44;
// TODO: replace with authUser.uid once chart fetching is wired to the real user
const CHART_UID = 'seed-user-001';

export default function HomeScreen() {
  const { userDoc, loading: userLoading } = useUser();
  const insets = useSafeAreaInsets();
  const { scale } = useResponsive();
  const headerHeight = insets.top + scale(NAV_BAR_HEIGHT);

  const [chartDetails, setChartDetails] = useState<NatalChartDetailsDoc | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [horoscope, setHoroscope] = useState<HoroscopeResult | null>(null);
  const [horoscopeGenerating, setHoroscopeGenerating] = useState(false);
  const [transitMoon, setTransitMoon] = useState<MoonData | null>(null);
  const [transitRetrogrades, setTransitRetrogrades] = useState<string[]>([]);

  const unsubHoroscopeRef = useRef<(() => void) | null>(null);

  // ─── Chart fetch ────────────────────────────────────────────────────────────

  const fetchChartDetails = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'users', CHART_UID, 'natalChart', 'details'));
      setChartDetails(snap.exists() ? (snap.data() as NatalChartDetailsDoc) : null);
    } catch {
      setChartDetails(null);
    }
  }, []);

  useEffect(() => {
    setChartLoading(true);
    fetchChartDetails().finally(() => setChartLoading(false));
  }, []);

  // ─── Horoscope fetch / generation ───────────────────────────────────────────

  useEffect(() => {
    if (!chartDetails) return;

    let cancelled = false;
    const dateId = getTodayDateId();
    const lat = userDoc?.birthLat ?? 0;
    const lon = userDoc?.birthLon ?? 0;

    // Run transit calculation and horoscope fetch in parallel
    const transitsPromise = calculateTransits(new Date(), lat, lon)
      .then(t => {
        if (!cancelled) {
          setTransitMoon(t.moon);
          setTransitRetrogrades(t.planets.filter(p => p.isRetrograde).map(p => p.name));
        }
        return t;
      })
      .catch(() => null);

    Promise.all([fetchHoroscope(CHART_UID, dateId), transitsPromise])
      .then(([{ result, pending }, transits]) => {
        if (cancelled) return;

        if (result) {
          setHoroscope(result);
          return;
        }

        setHoroscopeGenerating(true);

        const unsub = subscribeToHoroscope(CHART_UID, dateId, (r) => {
          setHoroscope(r);
          setHoroscopeGenerating(false);
          unsubHoroscopeRef.current?.();
          unsubHoroscopeRef.current = null;
        });
        unsubHoroscopeRef.current = unsub;

        if (!pending) {
          // Use today's transiting moon; fall back to natal moon if transits failed
          const moon = transits?.moon ?? chartDetails.moon;
          requestHoroscope(CHART_UID, dateId, chartDetails, moon).catch(console.error);
        }
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      unsubHoroscopeRef.current?.();
      unsubHoroscopeRef.current = null;
    };
  }, [chartDetails]);

  // ─── Pull-to-refresh ────────────────────────────────────────────────────────

  const refreshAll = useCallback(async () => {
    const dateId = getTodayDateId();
    await fetchChartDetails();
    const { result } = await fetchHoroscope(CHART_UID, dateId);
    if (result) setHoroscope(result);
  }, [fetchChartDetails]);

  const { refreshControl } = usePullToRefresh(refreshAll);

  // ─── Derived values ─────────────────────────────────────────────────────────

  const loading = userLoading || chartLoading;

  const sunSign = chartDetails?.planets.find(p => p.name === 'Sun')?.sign ?? '—';
  const moonSign = chartDetails?.planets.find(p => p.name === 'Moon')?.sign ?? '—';
  const risingSign = chartDetails?.ascendant.sign ?? '—';

  // Prefer today's transiting moon; fall back to natal moon while loading
  const moonSource = transitMoon ?? chartDetails?.moon ?? null;
  const moonData = moonSource
    ? {
        phaseName: moonSource.phase,       // text name → maps to phase asset image
        illumination: moonSource.illumination,
        moonSign: moonSource.sign,
      }
    : undefined;

  // Use calculated retrogrades from Swiss Ephemeris; fall back to AI list if not yet computed
  const retrogrades = transitRetrogrades.length > 0
    ? transitRetrogrades
    : (horoscope?.planetsRetrograde ?? []).filter(p => p.toLowerCase() !== 'none');

  const today = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <ThemedView style={styles.container}>
      <HeaderNav
        title={userDoc?.name ?? 'Home'}
        rightIconName="person-circle-outline"
        onRightPress={() => console.log('go to profile')}
      />

      {loading ? <LoadingScreen /> : (
        <View style={[styles.content, { paddingTop: headerHeight }]}>
          <HomeSignsDisplay
            sun={sunSign}
            moon={moonSign}
            rising={risingSign}
            showViewChart={true}
            birthChartReady={!!chartDetails}
          />
          <DateSwitcher
            value={today}
            dates={[today]}
            onChange={(date) => console.log('selected date', date)}
          />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + scale(80) }]}
            refreshControl={refreshControl}
            showsVerticalScrollIndicator={false}
          >
            {horoscopeGenerating && (
              <View style={styles.generatingRow}>
                <ActivityIndicator size="small" color="#BCA8F4" />
                <Text style={styles.generatingText}>Generating your horoscope...</Text>
              </View>
            )}

            <SectionTitle sectionName="quote" title="Quote" />
            <HomeTextBox sectionName="quote" content={horoscope?.quote} />

            <SectionTitle sectionName="advice" title="Advice" />
            <HomeTextBox sectionName="advice" content={horoscope?.advice} />

            <SectionTitle sectionName="dos" title="Do's" />
            <HomeTextBox sectionName="dos" content={horoscope?.do ?? []} />

            <SectionTitle sectionName="donts" title="Don'ts" />
            <HomeTextBox sectionName="donts" content={horoscope?.dont ?? []} />

            <SectionTitle sectionName="affirmation" title="Affirmation" />
            <HomeTextBox sectionName="affirmation" content={horoscope?.affirmation} />

            <SectionTitle sectionName="tarot" title="Today's Cards" />
            <HomeTextBox sectionName="tarot" content={horoscope?.tarot} />

            <SectionTitle sectionName="message" title="Message in a Bottle" />
            <HomeTextBox sectionName="message" />

            <SectionTitle sectionName="moon" title="Moon Phase" />
            <HomeTextBox
              sectionName="moon"
              content={horoscope?.moonPhaseDetails}
              contentTwo={horoscope?.moon}
              moonData={moonData}
            />

            <SectionTitle sectionName="retrograde" title="Planets in Retrograde" />
            <HomeTextBox sectionName="retrograde" content={retrogrades} />

            <SectionTitle sectionName="newLove" title="New Love" />
            <HomeTextBox sectionName="newLove" content={horoscope?.newLove ?? []} />

            <SectionTitle sectionName="returns" title="Returns" />
            <HomeTextBox sectionName="returns" content={horoscope?.returns ?? []} />

            <SectionTitle sectionName="luckyNumbers" title="Lucky Numbers" />
            <HomeTextBox sectionName="luckyNumbers" content={horoscope?.luckyNumbers ?? []} />

            <SectionTitle sectionName="warning" title="Warning" />
            <HomeTextBox sectionName="warning" content={horoscope?.warning} />
          </ScrollView>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  content: {
    flex: 1,
    width: '100%',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  generatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginBottom: 8,
  },
  generatingText: {
    color: '#BCA8F4',
    fontSize: 14,
  },
});
