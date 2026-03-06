import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HeaderNav from '@/src/components/shared/header-nav';
import PremiumUnlock from '@/src/components/shared/premium-unlock.component';
import { ThemedView } from '@/src/components/themed-view';
import { moderateScale, scale as staticScale, verticalScale } from '@/src/utils/responsive';
import { C, R, S } from '@/src/constants/theme';
import { useHoroscope } from '@/src/context/horoscope-context';
import { useUser } from '@/src/context/user-context';
import { usePullToRefresh } from '@/src/hooks/use-pull-to-refresh';
import { useResponsive } from '@/src/hooks/use-responsive';
import { updateUserDoc } from '@/src/services/user.service';
import type { TransitHouseReading } from '@/src/types/transit-reading.types';

import LoadingScreen from '../(util)/loading-screen';

const NAV_BAR_HEIGHT = 44;

// ─── House Card ──────────────────────────────────────────────────────────────

function HouseCard({
  house,
  isLocked,
  retrogradesActive,
}: {
  house: TransitHouseReading;
  isLocked: boolean;
  retrogradesActive?: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasTransits = house.transits && house.transits.length > 0;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => setExpanded(e => !e)}
      style={houseStyles.card}
    >
      {/* Header: house number + chevron */}
      <View style={houseStyles.header}>
        <Text style={houseStyles.houseNum}>House {house.house}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={moderateScale(14)}
          color={C.muted}
        />
      </View>

      {/* Transiting planet chips — always visible */}
      {hasTransits && (
        <View style={houseStyles.planetsRow}>
          {house.transits.map((transit) => {
            const isRx = retrogradesActive?.includes(transit.name);
            const color = C.planet[transit.name] ?? C.muted;
            return (
              <View key={transit.name} style={houseStyles.planetChip}>
                <Text style={[houseStyles.planetName, { color }]}>
                  {transit.name}{isRx ? ' Rx' : ''}
                </Text>
                <Text style={houseStyles.planetPos}>{transit.degree} {transit.sign}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Expanded: interpretation or lock */}
      {expanded && (
        <>
          <View style={houseStyles.divider} />
          {isLocked ? (
            <View style={houseStyles.lockedRow}>
              <Ionicons name="lock-closed-outline" size={moderateScale(14)} color={C.muted} />
              <Text style={houseStyles.lockedText}>Unlock with Premium</Text>
            </View>
          ) : (
            <Text style={houseStyles.interpretation}>{house.interpretation}</Text>
          )}
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
    refresh,
  } = useHoroscope();

  const { authUser, userDoc, refresh: refreshUser } = useUser();

  const insets = useSafeAreaInsets();
  const { scale } = useResponsive();
  const headerHeight = insets.top + scale(NAV_BAR_HEIGHT);
  const { refreshControl } = usePullToRefresh(refresh);

  const [unlocking, setUnlocking] = useState(false);

  const isPremium = userDoc?.isPremiumMember ?? false;

  // Determine which houses to lock for free users:
  // unlock the 3 houses with the most transiting planets, lock the rest.
  const lockedHouses = useMemo(() => {
    if (isPremium || !transitReading?.houses) return new Set<string>();
    const sorted = [...transitReading.houses].sort(
      (a, b) => b.transits.length - a.transits.length,
    );
    const unlocked = new Set(sorted.slice(0, 3).map(h => h.house));
    return new Set(
      transitReading.houses.filter(h => !unlocked.has(h.house)).map(h => h.house),
    );
  }, [isPremium, transitReading?.houses]);

  const handleUnlock = async () => {
    if (!authUser?.uid) return;
    setUnlocking(true);
    try {
      await updateUserDoc(authUser.uid, { isPremiumMember: true });
      await refreshUser();
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <HeaderNav title="Transits" />

      {loading ? (
        <LoadingScreen />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: headerHeight + scale(12), paddingBottom: insets.bottom + scale(20) },
          ]}
          refreshControl={refreshControl}
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
              isLocked={lockedHouses.has(house.house)}
              retrogradesActive={transitReading.retrogradesActive}
            />
          ))}

          {/* Unlock CTA for free users */}
          {!isPremium && lockedHouses.size > 0 && (
            <View style={styles.unlockWrap}>
              {unlocking ? (
                <ActivityIndicator color={C.purple} />
              ) : (
                <PremiumUnlock
                  onUnlock={handleUnlock}
                  title="Unlock All 12 Houses"
                  message="See how every transit is affecting every area of your life right now."
                />
              )}
            </View>
          )}
        </ScrollView>
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
  houseNum: {
    fontSize: moderateScale(14),
    fontWeight: '700',
    color: C.gold,
    letterSpacing: 0.5,
  },
  planetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: staticScale(S.sm),
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
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: staticScale(S.xs),
    paddingVertical: verticalScale(S.xs),
  },
  lockedText: {
    fontSize: moderateScale(13),
    color: C.muted,
    fontStyle: 'italic',
  },
  interpretation: {
    fontSize: moderateScale(13),
    lineHeight: moderateScale(20),
    color: C.white,
  },
});

const styles = StyleSheet.create({
  container:     { flex: 1, justifyContent: 'flex-start' },
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
  unlockWrap: {
    marginTop: verticalScale(S.md),
    marginBottom: verticalScale(S.sm),
  },
});
