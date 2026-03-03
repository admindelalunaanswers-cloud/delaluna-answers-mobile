import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import HeaderNav from '@/src/components/shared/header-nav';
import NatalWheelTab from '@/src/components/natalChart/natal-chart-wheel';
import NatalTable from '@/src/components/natalChart/natal-chart-table';
import { useHoroscope } from '@/src/context/horoscope-context';
import { useResponsive } from '@/src/hooks/use-responsive';
import { usePullToRefresh } from '@/src/hooks/use-pull-to-refresh';
import type { NatalChart } from '@/src/services/astroEngine';
import type { NatalChartBreakdownResult } from '@/src/types/natal-chart-breakdown.types';

import LoadingScreen from '../(util)/loading-screen';

const NAV_BAR_HEIGHT = 44;

export default function BirthChartScreen() {
  const {
    chartDetails,
    breakdown,
    loading,
    refresh,
  } = useHoroscope();

  const [activeTab, setActiveTab] = useState<'Natal Wheel' | 'Natal Table'>('Natal Wheel');

  const insets = useSafeAreaInsets();
  const { scale } = useResponsive();
  const headerHeight = insets.top + scale(NAV_BAR_HEIGHT);

  const { refreshControl } = usePullToRefresh(refresh);

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
        {loading ? <LoadingScreen /> : (
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
                    <NatalTable
                      planets={chartDetails.planets as unknown as NatalChart['planets']}
                      asc={chartDetails.ascendant}
                    />
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
                { paddingBottom: insets.bottom + scale(24) },
              ]}
              refreshControl={refreshControl}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.breakdownTitle}>Breakdown</Text>

              {breakdown && (
                <>
                  {renderTextSection('Quote', breakdown.quote)}
                  {renderTextSection('Your Chart', breakdown.personalitySnapshot)}
                  {renderHouses(breakdown.houses)}
                  {renderPlanets(breakdown.planets)}
                  {renderAspects(breakdown.aspects)}
                  {renderTextSection('Love', breakdown.loveRead)}
                  {renderTextSection('Career', breakdown.careerRead)}
                  {renderTextSection('Growth', breakdown.growthRead)}
                  {renderTextSection('Advice', breakdown.advice)}
                  {renderTextSection('Warning', breakdown.warning)}
                  {renderTextSection('Affirmation', breakdown.affirmation)}
                  {renderTextSection('Unlock More', breakdown.teaser)}
                  {renderTextSection('Release', breakdown.release)}
                </>
              )}
            </ScrollView>
          </>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, justifyContent: 'flex-start' },
  content:          { flex: 1, width: '100%', paddingHorizontal: 12, paddingBottom: 12, gap: 4 },
  topSection:       { flex: 2, overflow: 'hidden', borderRadius: 12 },
  tabList:          { flexDirection: 'row', padding: 12 },
  tab:              { flex: 1, padding: 12, alignItems: 'center' },
  activeTab:        { borderBottomWidth: 2, borderBottomColor: '#5BC0BE' },
  tabContent:       { flex: 1 },

  breakdownScroll:  { flex: 1, borderRadius: 12 },
  breakdownContent: { paddingHorizontal: 15, paddingTop: 12 },
  breakdownTitle:   { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 12 },

  section:          { marginBottom: 20 },
  sectionLabel:     { color: '#BCA8F4', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  sectionBody:      { color: '#E8E0FF', fontSize: 14, lineHeight: 22 },

  card:             { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12, marginBottom: 10 },
  cardTitle:        { color: '#BCA8F4', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  cardMeta:         { color: '#9D8EC4', fontSize: 12, marginBottom: 6 },
  cardBody:         { color: '#E8E0FF', fontSize: 13, lineHeight: 20 },
  locked:           { color: '#555', fontSize: 13, fontStyle: 'italic' },
});
