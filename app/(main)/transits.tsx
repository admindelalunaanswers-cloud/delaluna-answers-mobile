import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HeaderNav from '@/src/components/shared/header-nav';
import PaygateOverlay from '@/src/components/shared/paygate-overlay.component';
import { ThemedView } from '@/src/components/themed-view';
import { moderateScale, scale as staticScale, verticalScale } from '@/src/utils/responsive';
import { C, R, S } from '@/src/constants/theme';
import { useHoroscope } from '@/src/context/horoscope-context';
import { useRevenueCat } from '@/src/context/revenuecat-context';
import { useResponsive } from '@/src/hooks/use-responsive';
import type { TransitHouseReading } from '@/src/types/transit-reading.types';

import LoadingScreen from '../(util)/loading-screen';
import { ThemedText } from '@/src/components/themed-text';
import { HOUSE_KEYWORDS, TRANSITS_DEFINITION } from '@/src/constants/definitions';

const NAV_BAR_HEIGHT = 44;

// ─── House Card ──────────────────────────────────────────────────────────────

function HouseCard({
  house,
  isLocked,
  retrogradesActive,
  onLockedPress,
}: {
  house: TransitHouseReading;
  isLocked: boolean;
  retrogradesActive?: string[];
  onLockedPress: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasTransits = house.transits && house.transits.length > 0;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => (isLocked ? onLockedPress() : setExpanded(e => !e))}
      style={houseStyles.card}
    >
      {/* Header: house number + keyword + chevron / lock */}
      <View style={houseStyles.header}>
        <View style={houseStyles.headerLeft}>
          <Text style={houseStyles.houseNum}>House {house.house}</Text>
          {HOUSE_KEYWORDS[house.house] && (
            <Text style={houseStyles.houseKeyword}>{HOUSE_KEYWORDS[house.house]}</Text>
          )}
        </View>
        {isLocked ? (
          <Ionicons
            name="lock-closed"
            size={moderateScale(14)}
            color={C.muted}
          />
        ) : (
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={moderateScale(14)}
            color={C.muted}
          />
        )}
      </View>

      {/* Transiting planet chips — always visible */}
      {hasTransits && (
        <View style={houseStyles.planetsRow}>
          {house.transits.map((transit) => {
            const isRx = retrogradesActive?.includes(transit.name);
            const color = C.planet[transit.name] ?? C.muted;
            return (
              <View key={transit.name} style={houseStyles.planetChip}>
                <Text style={[houseStyles.planetName, { color }]} numberOfLines={1}>
                  {transit.name}{isRx ? ' Rx' : ''}
                </Text>
                <Text style={houseStyles.planetPos} numberOfLines={1}>{transit.degree} {transit.sign}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Excerpt — always visible for unlocked houses */}
      {!isLocked && house.interpretation && !expanded && (
        <Text style={houseStyles.excerpt} numberOfLines={2}>
          {house.interpretation}
        </Text>
      )}

      {/* Expanded: full interpretation (only when unlocked) */}
      {!isLocked && expanded && (
        <>
          <View style={houseStyles.divider} />
          <Text style={houseStyles.interpretation}>{house.interpretation}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function TransitsScreen() {
  const {
    transitReading,
    transitReadingGenerating,
    loading,
  } = useHoroscope();

  const { isPro } = useRevenueCat();
  const isPremium = isPro;

  const insets = useSafeAreaInsets();
  const { scale } = useResponsive();
  const headerHeight = insets.top + scale(NAV_BAR_HEIGHT);

  const handleUnlock = () => {
    router.push('/(settings)/paywall');
  };

  return (
    <ThemedView style={styles.container}>
      <HeaderNav title="Transits" />
      <ThemedView style={[styles.definitionContainer, { paddingTop: headerHeight + scale(8) }]}>
        <ThemedText style={styles.subtitle}>
          {TRANSITS_DEFINITION}
        </ThemedText>
      </ThemedView>
      {loading ? (
        <LoadingScreen />
      ) : (
        <PaygateOverlay
          locked={!isPremium}
          style={{ flex: 1 }}
          unlockTitle="Unlock Transits"
          unlockMessage="Subscribe to see how current planetary transits are affecting every area of your life."
          onUnlock={handleUnlock}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: scale(12), paddingBottom: insets.bottom + scale(20) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {transitReadingGenerating && !transitReading && (
              <View style={styles.generatingRow}>
                <ActivityIndicator size="small" color={C.purple} />
                <Text style={styles.generatingText}>Generating house readings...</Text>
              </View>
            )}

            {transitReading?.houses?.map((house) => (
              <HouseCard
                key={house.house}
                house={house}
                isLocked={false}
                retrogradesActive={transitReading.retrogradesActive}
                onLockedPress={handleUnlock}
              />
            ))}
          </ScrollView>
        </PaygateOverlay>
      )}
    </ThemedView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const houseStyles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderColor: 'rgba(142, 68, 173, 0.4)',
    borderRadius: staticScale(R.md),
    padding: staticScale(S.md),
    marginBottom: verticalScale(S.sm),
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    gap: verticalScale(S.sm),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: staticScale(S.sm),
  },
  houseNum: {
    fontSize: moderateScale(14),
    fontWeight: '700',
    color: C.gold,
    letterSpacing: 0.5,
  },
  houseKeyword: {
    fontSize: moderateScale(11),
    color: C.muted,
    letterSpacing: 0.3,
  },
  planetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: staticScale(S.xs),
  },
  planetsRowContent: {},
  excerpt: {
    fontSize: moderateScale(12),
    lineHeight: moderateScale(18),
    color: 'rgba(255,255,255,0.45)',
    fontStyle: 'italic',
  },
  planetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: staticScale(S.xs),
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: staticScale(R.pill),
    paddingHorizontal: staticScale(S.sm),
    paddingVertical: staticScale(S.xs),
  },
  planetName: {
    fontSize: moderateScale(12),
    fontWeight: '600',
  },
  planetPos: {
    fontSize: moderateScale(11),
    color: C.moonSilver,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(142, 68, 173, 0.3)',
  },
  interpretation: {
    fontSize: moderateScale(13),
    lineHeight: moderateScale(22),
    color: C.white,
    includeFontPadding: false,
  },
});

const styles = StyleSheet.create({
  container:     { flex: 1, justifyContent: 'flex-start' },
  definitionContainer: {
    alignItems: 'center',
    paddingHorizontal: staticScale(16),
    paddingBottom: verticalScale(S.sm),
  },
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: staticScale(16) },
  housesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: staticScale(S.sm),
    marginBottom: verticalScale(6),
    paddingBottom: verticalScale(S.md),
  },
  housesTitle: {
    fontSize: moderateScale(16),
    fontWeight: '700',
    color: '#5BC0BE',
  },
  generatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: staticScale(S.sm),
    paddingVertical: verticalScale(S.md),
    marginBottom: verticalScale(S.md),
  },
  generatingText: {
    fontSize: moderateScale(13),
    color: C.muted,
  },
  subtitle: {
    marginTop: verticalScale(16),
    fontSize: moderateScale(14),
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: verticalScale(16),
    alignSelf: 'stretch',
  },
});
