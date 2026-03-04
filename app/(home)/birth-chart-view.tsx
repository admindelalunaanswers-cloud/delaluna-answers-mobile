import { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, getDoc } from 'firebase/firestore';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import HeaderNav from '@/src/components/shared/header-nav';
import NatalWheelTab from '@/src/components/natalChart/natal-chart-wheel';
import NatalTable from '@/src/components/natalChart/natal-chart-table';
import { useHoroscope } from '@/src/context/horoscope-context';
import { useUser } from '@/src/context/user-context';
import { usePullToRefresh } from '@/src/hooks/use-pull-to-refresh';
import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';
import { db } from '@/firebaseConfig';
import type { NatalChart } from '@/src/services/astroEngine';
import type { NatalChartBreakdownResult } from '@/src/types/natal-chart-breakdown.types';


const NAV_BAR_HEIGHT = 44;

export default function BirthChartScreen() {
  const { chartDetails } = useHoroscope();
  const { authUser, userDoc } = useUser();
  const isPremium = (userDoc as any)?.isPremiumMember ?? false;

  const [breakdown, setBreakdown] = useState<NatalChartBreakdownResult | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(true);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);

  const fetchBreakdown = useCallback(async () => {
    const uid = authUser?.uid;
    if (!uid) {
      setBreakdownLoading(false);
      return;
    }
    setBreakdownLoading(true);
    setBreakdownError(null);
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'natalChart', 'details'));
      if (!snap.exists()) {
        setBreakdownError('No breakdown available yet.');
        return;
      }
      const data = snap.data();
      const state: string | undefined = data?.status?.state;
      if (state === 'ERROR') {
        setBreakdownError('Breakdown generation failed. Please try again later.');
        return;
      }
      const raw = data?.response ?? data?.result ?? data?.output;
      if (!raw) {
        setBreakdownError(state ? `Still generating… (${state})` : 'Breakdown not ready yet.');
        return;
      }
      const cleaned = typeof raw === 'string'
        ? raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
        : null;
      const parsed: NatalChartBreakdownResult =
        cleaned !== null ? JSON.parse(cleaned) : raw;
      setBreakdown(parsed);
    } catch (err: any) {
      console.error('[BirthChart] breakdown fetch error:', err);
      setBreakdownError(err?.message ?? 'Could not load breakdown.');
    } finally {
      setBreakdownLoading(false);
    }
  }, [authUser?.uid]);

  useEffect(() => {
    fetchBreakdown();
  }, [fetchBreakdown]);

  const [activeTab, setActiveTab] = useState<'Natal Wheel' | 'Natal Table'>('Natal Wheel');

  const { refreshControl: breakdownRefreshControl } = usePullToRefresh(
    async () => { if (!breakdown) await fetchBreakdown(); }
  );

  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + scale(NAV_BAR_HEIGHT);

  // ─── Render helpers ─────────────────────────────────────────────────────────

  function renderTextSection(label: string, content: string | undefined) {
    if (!content) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{label}</Text>
        <Text style={styles.sectionBody}>{content}</Text>
      </View>
    );
  }

  function renderHouses(houses: NatalChartBreakdownResult['houses']) {
    if (!houses?.length) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Houses</Text>
        {houses.map((h) => (
          <View key={h.house} style={styles.card}>
            <Text style={styles.cardTitle}>
              House {h.house} — {h.sign} {h.degree}
              {h.ruler ? `  ·  ruled by ${h.ruler}` : ''}
            </Text>
            {h.planets.length > 0 && (
              <Text style={styles.cardMeta}>
                {h.planets.map(p =>
                  `${p.name} in ${p.sign} ${p.degree}${p.retrograde ? ' ℞' : ''}`
                ).join('  ·  ')}
              </Text>
            )}
            <Text style={h.locked ? styles.locked : styles.cardBody}>
              {h.interpretation}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  function renderPlanets(planets: NatalChartBreakdownResult['planets']) {
    if (!planets?.length) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Planets</Text>
        {planets.map((p) => (
          <View key={p.name} style={styles.card}>
            <Text style={styles.cardTitle}>
              {p.name} in {p.sign} {p.degree}  ·  House {p.house}{p.retrograde ? '  ℞' : ''}
            </Text>
            <Text style={styles.cardBody}>{p.interpretation}</Text>
          </View>
        ))}
      </View>
    );
  }

  function renderAspects(aspects: NatalChartBreakdownResult['aspects']) {
    if (!aspects?.length) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Aspects</Text>
        {aspects.map((a, i) => (
          <View key={i} style={styles.card}>
            <Text style={styles.cardTitle}>
              {a.planet1} {a.aspect} {a.planet2}  ·  orb {a.orb}
            </Text>
            <Text style={styles.cardBody}>{a.interpretation}</Text>
          </View>
        ))}
      </View>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <ThemedView style={styles.container}>
      <HeaderNav
        title="Natal Chart"
        leftIconName="chevron-back-outline"
        onLeftPress={() => router.back()}
      />

      <View style={[styles.content, { paddingTop: headerHeight }]}>
          <>
            {/* Top Half — Wheel / Table tabs */}
            <ThemedView style={styles.topSection}>
              <ThemedView style={styles.tabList}>
                <Pressable
                  style={[styles.tab, activeTab === 'Natal Wheel' && styles.activeTab]}
                  onPress={() => setActiveTab('Natal Wheel')}
                >
                  <ThemedText type="defaultSemiBold">Natal Wheel</ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.tab, activeTab === 'Natal Table' && styles.activeTab]}
                  onPress={() => setActiveTab('Natal Table')}
                >
                  <ThemedText type="defaultSemiBold">Natal Table</ThemedText>
                </Pressable>
              </ThemedView>

              <ThemedView style={styles.tabContent}>
                {activeTab === 'Natal Wheel' ? (
                  chartDetails ? (
                    <NatalWheelTab natalChart={chartDetails as unknown as NatalChart} />
                  ) : (
                    <ThemedText>No chart data available.</ThemedText>
                  )
                ) : (
                  chartDetails ? (
                    <ScrollView showsVerticalScrollIndicator={false}>
                      <NatalTable
                        planets={chartDetails.planets as unknown as NatalChart['planets']}
                        asc={chartDetails.ascendant}
                      />
                    </ScrollView>
                  ) : (
                    <ThemedText>No chart data available.</ThemedText>
                  )
                )}
              </ThemedView>
            </ThemedView>

            {/* Bottom Half — Breakdown */}
            <ScrollView
              style={styles.breakdownScroll}
              contentContainerStyle={[
                styles.breakdownContent,
                { paddingBottom: insets.bottom + verticalScale(8) },
              ]}
              refreshControl={breakdownRefreshControl}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.breakdownTitle}>Breakdown</Text>

              {breakdownLoading ? (
                <ActivityIndicator color="#BCA8F4" style={{ marginTop: verticalScale(24) }} />
              ) : breakdownError ? (
                <Text style={styles.errorText}>{breakdownError}</Text>
              ) : breakdown ? (
                <>
                  {renderTextSection('Your Chart', breakdown.personalitySnapshot)}
                  {renderHouses(breakdown.houses)}
                  {isPremium ? (
                    <>
                      {renderPlanets(breakdown.planets)}
                      {renderAspects(breakdown.aspects)}
                      {renderTextSection('Love', breakdown.loveRead)}
                      {renderTextSection('Career', breakdown.careerRead)}
                      {renderTextSection('Growth', breakdown.growthRead)}
                      {renderTextSection('Advice', breakdown.advice)}
                      {renderTextSection('Warning', breakdown.warning)}
                      {renderTextSection('Affirmation', breakdown.affirmation)}
                      {renderTextSection('Release', breakdown.release)}
                    </>
                  ) : (
                    renderTextSection('Unlock More', breakdown.teaser)
                  )}
                </>
              ) : null}
            </ScrollView>
          </>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, justifyContent: 'flex-start' },
  content:          { flex: 1, width: '100%', paddingHorizontal: scale(12), paddingBottom: verticalScale(12), gap: scale(4) },
  topSection:       { flex: 1.5, overflow: 'hidden', borderRadius: scale(12) },
  tabList:          { flexDirection: 'row', paddingHorizontal: scale(12), paddingVertical: verticalScale(12) },
  tab:              { flex: 1, paddingHorizontal: scale(12), paddingVertical: verticalScale(12), alignItems: 'center' },
  activeTab:        { borderBottomWidth: 2, borderBottomColor: '#5BC0BE' },
  tabContent:       { flex: 1 },

  breakdownScroll:  { flex: 1.5, borderRadius: scale(12) },
  breakdownContent: { paddingHorizontal: scale(15), paddingTop: verticalScale(12) },
  breakdownTitle:   { color: '#fff', fontSize: moderateScale(18), fontWeight: '600', marginBottom: verticalScale(12) },

  section:          { marginBottom: verticalScale(12) },
  sectionLabel:     { color: '#BCA8F4', fontSize: moderateScale(12), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: verticalScale(6) },
  sectionBody:      { color: '#E8E0FF', fontSize: moderateScale(14), lineHeight: moderateScale(22) },

  card:             { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: scale(10), padding: scale(12), marginBottom: verticalScale(10) },
  cardTitle:        { color: '#BCA8F4', fontSize: moderateScale(13), fontWeight: '600', marginBottom: verticalScale(4) },
  cardMeta:         { color: '#9D8EC4', fontSize: moderateScale(12), marginBottom: verticalScale(6) },
  cardBody:         { color: '#E8E0FF', fontSize: moderateScale(13), lineHeight: moderateScale(20) },
  locked:           { color: '#555', fontSize: moderateScale(13), fontStyle: 'italic' },
  errorText:        { color: 'rgba(255,100,100,0.8)', fontSize: moderateScale(13), marginTop: verticalScale(16), textAlign: 'center' },
});
