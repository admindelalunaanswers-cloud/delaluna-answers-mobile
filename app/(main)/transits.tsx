import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { doc, getDoc } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HeaderNav from '@/src/components/shared/header-nav';
import SectionTitle from '@/src/components/shared/section-title.component';
import HomeTextBox from '@/src/components/home/home-text-box.component';
import { ThemedView } from '@/src/components/themed-view';
import { useUser } from '@/src/context/user-context';
import { db } from '@/firebaseConfig';
import { useResponsive } from '@/src/hooks/use-responsive';
import { usePullToRefresh } from '@/src/hooks/use-pull-to-refresh';
import { calculateTransits } from '@/src/services/astroEngine';
import type { TransitData } from '@/src/services/astroEngine';
import {
  fetchTransitReading,
  getTodayDateId,
  requestTransitReading,
  subscribeToTransitReading,
} from '@/src/services/transit-reading.service';
import type { TransitReadingResult } from '@/src/types/transit-reading.types';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';

const NAV_BAR_HEIGHT = 44;
// TODO: replace with authUser.uid once chart fetching is wired to the real user
const CHART_UID = 'seed-user-001';

export default function TransitsScreen() {
  const { userDoc } = useUser();
  const insets = useSafeAreaInsets();
  const { scale } = useResponsive();
  const headerHeight = insets.top + scale(NAV_BAR_HEIGHT);

  const [, setChartDetails] = useState<NatalChartDetailsDoc | null>(null);
  const [transits, setTransits] = useState<TransitData | null>(null);
  const [reading, setReading] = useState<TransitReadingResult | null>(null);
  const [readingGenerating, setReadingGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  const unsubReadingRef = useRef<(() => void) | null>(null);

  // ─── Fetch chart + calculate transits ───────────────────────────────────────

  const fetchData = useCallback(async () => {
    const lat = userDoc?.birthLat ?? 0;
    const lon = userDoc?.birthLon ?? 0;

    const [chartSnap, transitData] = await Promise.all([
      getDoc(doc(db, 'users', CHART_UID, 'natalChart', 'details')).catch(() => null),
      calculateTransits(new Date(), lat, lon).catch(() => null),
    ]);

    const chart = chartSnap?.exists() ? (chartSnap.data() as NatalChartDetailsDoc) : null;
    setChartDetails(chart);
    if (transitData) setTransits(transitData);

    return { chart, transitData };
  }, [userDoc?.birthLat, userDoc?.birthLon]);

  // ─── Trigger reading once data is ready ─────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchData()
      .then(({ chart, transitData }) => {
        if (cancelled || !chart || !transitData) return;

        const dateId = getTodayDateId();
        const tier = userDoc?.isPayingMember ? 'premium' : 'free';

        return fetchTransitReading(CHART_UID, dateId).then(({ result, pending }) => {
          if (cancelled) return;

          if (result) {
            setReading(result);
            return;
          }

          setReadingGenerating(true);

          const unsub = subscribeToTransitReading(CHART_UID, dateId, (r) => {
            setReading(r);
            setReadingGenerating(false);
            unsubReadingRef.current?.();
            unsubReadingRef.current = null;
          });
          unsubReadingRef.current = unsub;

          if (!pending) {
            requestTransitReading(CHART_UID, dateId, chart, transitData, tier).catch(console.error);
          }
        });
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
      unsubReadingRef.current?.();
      unsubReadingRef.current = null;
    };
  }, []);

  // ─── Pull-to-refresh ────────────────────────────────────────────────────────

  const refreshAll = useCallback(async () => {
    const dateId = getTodayDateId();
    const tier = userDoc?.isPayingMember ? 'premium' : 'free';

    const { chart, transitData } = await fetchData();
    if (!chart || !transitData) return;

    // Clear stale reading and force a new request
    setReading(null);
    setReadingGenerating(true);

    unsubReadingRef.current?.();
    const unsub = subscribeToTransitReading(CHART_UID, dateId, (r) => {
      setReading(r);
      setReadingGenerating(false);
      unsubReadingRef.current?.();
      unsubReadingRef.current = null;
    });
    unsubReadingRef.current = unsub;

    requestTransitReading(CHART_UID, dateId, chart, transitData, tier).catch(console.error);
  }, [fetchData, userDoc?.isPayingMember]);

  const { refreshControl } = usePullToRefresh(refreshAll);

  // ─── Derived values ─────────────────────────────────────────────────────────

  const retrogrades = transits?.planets.filter(p => p.isRetrograde).map(p => p.name) ?? [];

  const moonData = transits?.moon
    ? {
        phaseName: transits.moon.phase,
        illumination: transits.moon.illumination,
        moonSign: transits.moon.sign,
      }
    : undefined;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <ThemedView style={styles.container}>
      <HeaderNav title="Transits" />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#BCA8F4" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: headerHeight + 12, paddingBottom: insets.bottom + scale(80) },
          ]}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          {readingGenerating && (
            <View style={styles.generatingRow}>
              <ActivityIndicator size="small" color="#BCA8F4" />
              <Text style={styles.generatingText}>Generating your transit reading...</Text>
            </View>
          )}

          <SectionTitle sectionName="quote" title="Quote" />
          <HomeTextBox sectionName="quote" content={reading?.quote} />

          <SectionTitle sectionName="moon" title="Moon Phase" />
          <HomeTextBox sectionName="moon" moonData={moonData} />

          <SectionTitle sectionName="retrograde" title="Planets in Retrograde" />
          <HomeTextBox sectionName="retrograde" content={retrogrades} />

          <SectionTitle sectionName="advice" title="Today's Transits" />
          <HomeTextBox sectionName="advice" content={reading?.overview} />

          <SectionTitle sectionName="dos" title="Themes" />
          <HomeTextBox sectionName="dos" content={reading?.themes ?? []} />

          <SectionTitle sectionName="newLove" title="Love Transits" />
          <HomeTextBox sectionName="newLove" content={reading?.loveTransits} />

          <SectionTitle sectionName="returns" title="Career Transits" />
          <HomeTextBox sectionName="returns" content={reading?.careerTransits} />

          <SectionTitle sectionName="affirmation" title="Advice" />
          <HomeTextBox sectionName="affirmation" content={reading?.advice} />

          <SectionTitle sectionName="warning" title="Warning" />
          <HomeTextBox sectionName="warning" content={reading?.warning} />

          <SectionTitle sectionName="affirmation" title="Affirmation" />
          <HomeTextBox sectionName="affirmation" content={reading?.affirmation} />

          <SectionTitle sectionName="tarot" title="Unlock More" />
          <HomeTextBox sectionName="tarot" content={reading?.teaser} />

          <SectionTitle sectionName="message" title="Release" />
          <HomeTextBox sectionName="message" content={reading?.release} />
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, justifyContent: 'flex-start' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:           { flex: 1 },
  scrollContent:    { paddingHorizontal: 16 },
  generatingRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, marginBottom: 8 },
  generatingText:   { color: '#BCA8F4', fontSize: 14 },
});
