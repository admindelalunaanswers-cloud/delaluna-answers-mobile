import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';

import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import HeaderNav from '@/src/components/shared/header-nav';
import NatalWheelTab from '@/src/components/natalChart/natal-chart-wheel.tab';
import NatalTable from '@/src/components/natalChart/natal-chart-table.tab';
import { useHoroscope } from '@/src/context/horoscope-context';
import { useRevenueCat } from '@/src/context/revenuecat-context';
import PremiumUnlock from '@/src/components/shared/premium-unlock.component';
import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';
import { renderRichText } from '@/src/utils/rich-text';
import type { NatalChart } from '@/src/services/astroEngine';
import type { NatalChartBreakdownResult } from '@/src/types/natal-chart-breakdown.types';

const NAV_BAR_HEIGHT = 44;
const CHART_FRAME_HEIGHT = verticalScale(330);

type ChartTab     = 'Natal Wheel' | 'Natal Table';
type BreakdownTab = 'Insights' | 'Houses' | 'Planets' | 'Aspects';

const CHART_TABS:     ChartTab[]     = ['Natal Wheel', 'Natal Table'];
const BREAKDOWN_TABS: BreakdownTab[] = ['Insights', 'Houses', 'Planets', 'Aspects'];

export default function BirthChartScreen() {
  const {
    chartDetails,
    breakdown,
    premiumBreakdown,
    breakdownGenerating,
    premiumBreakdownGenerating,
  } = useHoroscope();

  const [chartTab, setChartTab]         = useState<ChartTab>('Natal Wheel');
  const [breakdownTab, setBreakdownTab] = useState<BreakdownTab>('Insights');

  const { isPro, loading: rcLoading } = useRevenueCat();
  const isPremium = rcLoading || isPro;

  const insets       = useSafeAreaInsets();
  const headerHeight = insets.top + scale(NAV_BAR_HEIGHT);

  // Houses the free user can read: house 1 (Rising) + Sun's house + Moon's house
  const freeUnlockedHouses = new Set<string>(['1']);
  if (chartDetails) {
    for (const p of chartDetails.planets) {
      if (p.name === 'Sun' || p.name === 'Moon') freeUnlockedHouses.add(String(p.house));
    }
  }

  const activeBreakdown    = isPremium ? (premiumBreakdown ?? breakdown) : breakdown;
  const isBreakdownLoading = isPremium
    ? (!premiumBreakdown && premiumBreakdownGenerating)
    : (!breakdown && breakdownGenerating);

  // ─── Render helpers ─────────────────────────────────────────────────────────

  /** A labeled card used in the Insights tab */
  function renderInsightCard(label: string, content: string | undefined, title?: string) {
    if (!content) return null;
    return (
      <ThemedView key={label} style={styles.insightCard}>
        <ThemedText style={styles.insightLabel}>{label}</ThemedText>
        {title ? <ThemedText style={styles.insightTitle}>{title}</ThemedText> : null}
        <ThemedText style={styles.insightBody}>{renderRichText(content)}</ThemedText>
      </ThemedView>
    );
  }

  function renderInsights(b: NonNullable<typeof activeBreakdown>) {
    if (!isPremium) {
      return (
        <>
          {renderInsightCard('Overview',    b.personalitySnapshot)}
          {renderInsightCard('Big Picture', b.teaser)}
          {renderInsightCard('Release',     b.release)}
        </>
      );
    }
    return (
      <>
        {renderInsightCard('Overview',     b.personalitySnapshot)}
        {renderInsightCard('Love',         b.loveRead)}
        {renderInsightCard('Career',       b.careerRead)}
        {renderInsightCard('Growth',       b.growthRead)}
        {renderInsightCard('Advice',       b.advice)}
        {renderInsightCard('Warning',      b.warning)}
        {renderInsightCard('Affirmation',  b.affirmation)}
        {renderInsightCard('Release',      b.release)}
      </>
    );
  }

  function renderHouses(houses: NatalChartBreakdownResult['houses']) {
    if (!houses?.length) return <ThemedText style={styles.emptyText}>No house data.</ThemedText>;
    const displayHouses = isPremium
      ? houses
      : houses.map(h => ({ ...h, locked: !freeUnlockedHouses.has(h.house) }));
    return displayHouses.map((h) => (
      <ThemedView key={h.house} style={styles.card}>
        <ThemedView style={styles.cardHeader}>
          <ThemedText style={styles.cardTitle}>
            House {h.house} — {h.sign} {h.degree}
          </ThemedText>
          {h.ruler ? <ThemedText style={styles.cardMeta}>ruled by {h.ruler}</ThemedText> : null}
          {h.locked && (
            <Ionicons name="lock-closed" size={scale(11)} color="rgba(255,255,255,0.3)" style={{ marginLeft: scale(6) }} />
          )}
        </ThemedView>
        {!h.locked && h.planets.length > 0 && (
          <ThemedText style={styles.cardSubMeta}>
            {h.planets.map(p => `${p.name} in ${p.sign} ${p.degree}`).join('  ·  ')}
          </ThemedText>
        )}
        {!h.locked && <ThemedText style={styles.cardBody}>{renderRichText(h.interpretation)}</ThemedText>}
      </ThemedView>
    ));
  }

  function renderPlanets(planets: NatalChartBreakdownResult['planets']) {
    if (!planets?.length) return <ThemedText style={styles.emptyText}>No planet data.</ThemedText>;
    return planets.map((p) => (
      <ThemedView key={p.name} style={styles.card}>
        <ThemedView style={styles.cardHeader}>
          <ThemedText style={styles.cardTitle}>
            {p.name} in {p.sign} {p.degree}
          </ThemedText>
          <ThemedText style={styles.cardMeta}>House {p.house}</ThemedText>
        </ThemedView>
        <ThemedText style={styles.cardBody}>{renderRichText(p.interpretation)}</ThemedText>
      </ThemedView>
    ));
  }

  function renderAspects(aspects: NatalChartBreakdownResult['aspects']) {
    if (!aspects?.length) return <ThemedText style={styles.emptyText}>No aspect data.</ThemedText>;
    return aspects.map((a, i) => (
      <ThemedView key={i} style={styles.card}>
        <ThemedView style={styles.cardHeader}>
          <ThemedText style={styles.cardTitle}>
            {a.planet1} {a.aspect} {a.planet2}
          </ThemedText>
          <ThemedText style={styles.cardMeta}>orb {a.orb}</ThemedText>
        </ThemedView>
        <ThemedText style={styles.cardBody}>{renderRichText(a.interpretation)}</ThemedText>
      </ThemedView>
    ));
  }

  function renderBreakdownContent() {
    if (isBreakdownLoading) {
      return <ActivityIndicator color="#BCA8F4" style={{ marginTop: verticalScale(24) }} />;
    }
    if (!activeBreakdown) {
      return <ThemedText style={styles.errorText}>Breakdown not ready yet.</ThemedText>;
    }
    if (!isPremium && (breakdownTab === 'Planets' || breakdownTab === 'Aspects')) {
      const messages: Record<string, string> = {
        Planets: 'See how each planet placement shapes your personality, relationships, and life path.',
        Aspects: 'Discover the powerful connections between planets that drive your strengths and challenges.',
      };
      return (
        <PremiumUnlock
          title={`Unlock ${breakdownTab}`}
          message={messages[breakdownTab]}
        />
      );
    }
    switch (breakdownTab) {
      case 'Insights': return renderInsights(activeBreakdown);
      case 'Houses':   return renderHouses(activeBreakdown.houses);
      case 'Planets':  return renderPlanets(activeBreakdown.planets);
      case 'Aspects':  return renderAspects(activeBreakdown.aspects);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <ThemedView style={styles.container}>
      <HeaderNav
        title="Natal Chart"
        leftIconName="chevron-back-outline"
        onLeftPress={() => router.back()}
      />

      <ThemedView style={[styles.content, { paddingTop: headerHeight }]}>

        {/* ── Chart view (Wheel / Table) ─────────────────────────── */}
        <ThemedView style={styles.topSection}>
          <ThemedView style={styles.chartTabList}>
            {CHART_TABS.map(tab => (
              <Pressable
                key={tab}
                style={[styles.chartTab, chartTab === tab && styles.chartTabActive]}
                onPress={() => setChartTab(tab)}
              >
                <ThemedText type="defaultSemiBold">{tab}</ThemedText>
              </Pressable>
            ))}
          </ThemedView>

          <ThemedView style={[styles.chartContent]}>
            {chartTab === 'Natal Wheel' ? (
              chartDetails ? (
                <NatalWheelTab natalChart={chartDetails as unknown as NatalChart} />
              ) : (
                <ThemedText>No chart data available.</ThemedText>
              )
            ) : (
              chartDetails ? (
                <NatalTable planets={chartDetails.planets} asc={chartDetails.ascendant} />
              ) : (
                <ThemedText>No chart data available.</ThemedText>
              )
            )}
          </ThemedView>
        </ThemedView>

        {/* ── Breakdown (Insights / Houses / Planets / Aspects) ─── */}

        <ThemedView style={styles.breakdownSection}>

          {/* Tinted tab bar — visually distinct from chart tabs above */}
          <ThemedView style={styles.breakdownTabBar}>
            <ThemedView style={styles.breakdownTabList}>
              {BREAKDOWN_TABS.map(tab => {
                const locked = !isPremium && (tab === 'Planets' || tab === 'Aspects');
                const isActive = breakdownTab === tab;
                return (
                  <Pressable
                    key={tab}
                    style={[styles.breakdownTab, isActive && styles.breakdownTabActive]}
                    onPress={() => setBreakdownTab(tab)}
                  >
                    <ThemedView style={styles.breakdownTabInner}>
                      <ThemedText style={[styles.breakdownTabText, isActive && styles.breakdownTabTextActive]}>
                        {tab}
                      </ThemedText>
                      {locked && (
                        <Ionicons name="lock-closed" size={scale(9)} color="rgba(255,255,255,0.35)" />
                      )}
                    </ThemedView>
                  </Pressable>
                );
              })}
            </ThemedView>
          </ThemedView>

          <ScrollView
            style={styles.breakdownScroll}
            contentContainerStyle={[
              styles.breakdownContent,
              { paddingBottom: insets.bottom + verticalScale(16) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {renderBreakdownContent()}
          </ScrollView>
        </ThemedView>

      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content:   { flex: 1, paddingHorizontal: scale(5), gap: verticalScale(5) },

  // ── Chart section ──────────────────────────────────────────────────────────
  topSection:     { height: CHART_FRAME_HEIGHT, overflow: 'hidden'},
  chartTabList:   { flexDirection: 'row', paddingHorizontal: scale(5), paddingVertical: verticalScale(5) },
  chartTab:       { flex: 1, paddingVertical: verticalScale(6), alignItems: 'center' },
  chartTabActive: { borderBottomWidth: 2, borderBottomColor: '#5BC0BE' },
  chartContent:   { flex: 1, paddingHorizontal: scale(5), paddingTop: verticalScale(5) },

  // ── Breakdown section ──────────────────────────────────────────────────────
  breakdownSection: { flex: 1, borderRadius: scale(12), overflow: 'hidden' },

  breakdownTabBar: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: scale(5),
    paddingVertical: verticalScale(5),
  },
  breakdownTabList: {
    flexDirection: 'row',
  },
  breakdownTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: verticalScale(5),
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  breakdownTabInner: { flexDirection: 'row', alignItems: 'center', gap: scale(4) },
  breakdownTabActive: {
    backgroundColor: 'rgba(124,110,247,0.1)',
    borderBottomColor: '#7c6ef7',
  },
  breakdownTabText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: moderateScale(12),
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  breakdownTabTextActive: {
    color: '#fff',
  },

  devToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: scale(6), paddingHorizontal: scale(4) },
  devLabel:  { color: 'rgba(255,255,255,0.4)', fontSize: moderateScale(10) },

  breakdownScroll:  { flex: 1 },
  breakdownContent: { paddingHorizontal: scale(4), paddingTop: verticalScale(12), gap: verticalScale(10) },

  // ── Insight cards (Insights tab) ───────────────────────────────────────────
  insightCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: scale(12),
    justifyContent: 'center',
    alignItems: 'center',
  },
  insightLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: moderateScale(15),
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: verticalScale(5),
  },
  insightTitle: {
    color: '#fff',
    fontSize: moderateScale(13),
    fontWeight: '600',
    marginBottom: verticalScale(5),
  },
  insightBody: {
    color: 'rgb(255, 255, 255)',
    fontSize: moderateScale(12),
    lineHeight: moderateScale(15),
  },

  // ── Houses / Planets / Aspects cards ──────────────────────────────────────
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: scale(12),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: verticalScale(5),
  },
  cardTitle: {
    color: '#f2f2f2',
    fontSize: moderateScale(12),
    fontWeight: '600',
    flex: 1,
  },
  cardMeta: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: moderateScale(10),
    marginLeft: scale(5),
  },
  cardSubMeta: {
    color: 'rgba(255, 255, 255, 0.84)',
    fontSize: moderateScale(10),
    marginBottom: verticalScale(6),
  },
  cardBody: {
    color: 'rgba(255, 255, 255, 0.76)',
    fontSize: moderateScale(12),
    lineHeight: moderateScale(15),
  },
  locked: {
    color: '#555',
    fontSize: moderateScale(12),
    fontStyle: 'italic',
  },

  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: moderateScale(13), textAlign: 'center', marginTop: verticalScale(24) },
  errorText: { color: 'rgba(255,100,100,0.8)', fontSize: moderateScale(13), marginTop: verticalScale(16), textAlign: 'center' },
});