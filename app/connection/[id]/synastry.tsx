import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HeaderNav from "@/src/components/shared/header-nav";
import SynastryWheel from "@/src/components/synastry/synastry-wheel.draw";
import { calculateSynastry, type Aspect } from "@/src/services/astroEngine";
import {
  fetchSynastryReading,
  requestSynastryReading,
  subscribeToSynastryReading,
} from "@/src/services/synastry-reading.service";
import { useUser } from "@/src/context/user-context";
import { NavigationStore } from "@/src/stores/navigation-store";
import { selectTopAspects } from "@/src/utils/synastry";
import type { SynastryReadingResult } from "@/src/types/synastry-reading.types";
import { C } from "@/src/constants/theme";
import { scale, verticalScale, moderateScale } from "@/src/utils/responsive";
import { ThemedView } from "@/src/components/themed-view";

const NAV_BAR_HEIGHT = 44;

const ASPECT_COLORS: Record<string, string> = {
  harmonious: "#70a060",
  challenging: "#e05050",
  neutral: "#d4a853",
  minor: "#9098b8",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function AspectRow({ a }: { a: Aspect }) {
  const color = ASPECT_COLORS[a.nature] ?? C.muted;
  const orbDeg = Math.floor(a.orb);
  const orbMin = Math.floor((a.orb % 1) * 60);
  return (
    <View style={styles.aspectRow}>
      <View style={styles.aspectPlanets}>
        <Text style={[styles.aspectPSym, { color: C.planet[a.planet1] ?? C.muted }]}>
          {a.symbol1}
        </Text>
        <Text style={[styles.aspectSym, { color }]}>{a.aspectSymbol}</Text>
        <Text style={[styles.aspectPSym, { color: C.planet[a.planet2] ?? C.muted }]}>
          {a.symbol2}
        </Text>
      </View>
      <View style={styles.aspectMid}>
        <Text style={[styles.aspectType, { color }]}>{a.type}</Text>
        <Text style={styles.aspectNames}>
          {a.planet1} · {a.planet2}
        </Text>
      </View>
      <Text style={styles.aspectOrb}>
        {orbDeg}°{pad(orbMin)}'
      </Text>
    </View>
  );
}

function NamesRow({ nameA, nameB }: { nameA: string; nameB: string }) {
  return (
    <View style={styles.namesRow}>
      <Text
        style={[styles.nameText, { color: C.purpleLight }]}
        numberOfLines={1}
      >
        {nameA}
      </Text>
      <Ionicons
        name="heart"
        size={moderateScale(16)}
        color="#ffffff"
        style={styles.heartIcon}
      />
      <Text
        style={[styles.nameText, { color: C.gold }]}
        numberOfLines={1}
      >
        {nameB}
      </Text>
    </View>
  );
}

function ReadingSection({
  label,
  body,
  loading,
}: {
  label: string;
  body?: string;
  loading: boolean;
}) {
  return (
    <View style={styles.readingCard}>
      <Text style={styles.readingLabel}>{label}</Text>
      {body ? (
        <Text style={styles.readingBody}>{body}</Text>
      ) : loading ? (
        <View style={styles.readingLoading}>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
          <Text style={styles.readingLoadingText}>Generating…</Text>
        </View>
      ) : (
        <Text style={styles.readingPlaceholder}>Reading unavailable.</Text>
      )}
    </View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function SynastryAnalysisScreen() {
  const payload = NavigationStore.getSynastryAnalysis();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + verticalScale(NAV_BAR_HEIGHT);
  const { width: windowWidth } = useWindowDimensions();
  const { id: connectionId } = useLocalSearchParams<{ id: string }>();
  const { authUser } = useUser();

  const wheelSize = Math.min(windowWidth - scale(36), scale(340));

  const topAspects = useMemo(() => {
    if (!payload) return [];
    const aspects = calculateSynastry(payload.chartA.planets, payload.chartB.planets);
    return selectTopAspects(aspects);
  }, [payload]);

  const [reading, setReading] = useState<SynastryReadingResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!payload || !connectionId || !authUser?.uid) return;

    const uid = authUser.uid;
    let cancelled = false;

    (async () => {
      try {
        const existing = await fetchSynastryReading(uid, connectionId);
        if (cancelled) return;

        if (existing.result) {
          setReading(existing.result);
          setLoading(false);
          return;
        }

        if (!existing.pending) {
          await requestSynastryReading(
            uid,
            connectionId,
            payload.chartA,
            payload.chartB,
            payload.nameA,
            payload.nameB,
          );
        }

        if (cancelled) return;

        unsubRef.current = subscribeToSynastryReading(uid, connectionId, (r) => {
          setReading(r);
          setLoading(false);
        });
      } catch (err) {
        console.error("[synastry] failed to load reading", err);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [payload, connectionId, authUser?.uid]);

  if (!payload) {
    return (
      <View style={styles.wrapper}>
        <HeaderNav
          title="Synastry"
          leftIconName="arrow-back"
          onLeftPress={() => router.back()}
        />
        <View style={[styles.centered, { marginTop: headerHeight }]}>
          <Text style={styles.errorText}>No synastry data available.</Text>
        </View>
      </View>
    );
  }

  const { chartA, chartB, nameA, nameB } = payload;

  return (
    <View style={styles.wrapper}>
      <HeaderNav
        title="Synastry"
        leftIconName="arrow-back"
        onLeftPress={() => router.back()}
      />

      <View style={[styles.mainContent, { marginTop: headerHeight }]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <NamesRow nameA={nameA} nameB={nameB} />

          <View style={styles.wheelWrap}>
            <SynastryWheel
              chartA={chartA}
              chartB={chartB}
              highlightedAspects={topAspects}
              size={wheelSize}
            />
          </View>

          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: C.purpleLight }]} />
              <Text style={styles.legendText}>{nameA}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: C.gold }]} />
              <Text style={styles.legendText}>{nameB}</Text>
            </View>
          </View>

          <View style={styles.aspectsSection}>
            <Text style={styles.aspectsTitle}>KEY ASPECT</Text>
            <View style={styles.aspectsList}>
              {topAspects.length === 0 ? (
                <Text style={styles.aspectsEmpty}>No major aspects found.</Text>
              ) : (
                topAspects.map((a, i) => <AspectRow key={`${a.planet1}-${a.planet2}-${i}`} a={a} />)
              )}
            </View>
          </View>

          

          <ReadingSection
            label="LOVE LANGUAGE"
            body={reading?.loveLanguage}
            loading={loading}
          />
          <ReadingSection
            label="CONFLICT STYLE"
            body={reading?.conflictStyle}
            loading={loading}
          />
          <ReadingSection
            label="LONGEVITY"
            body={reading?.longevity}
            loading={loading}
          />
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  mainContent: {
    flex: 1,
    overflow: "hidden",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: scale(40),
  },
  content: {
    paddingHorizontal: scale(18),
    paddingTop: verticalScale(16),
    paddingBottom: verticalScale(48),
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: moderateScale(14),
    textAlign: "center",
  },

  // Names header
  namesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: verticalScale(12),
  },
  nameText: {
    fontSize: moderateScale(17),
    fontWeight: "700",
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  heartIcon: {
    marginHorizontal: scale(10),
  },

  // Wheel
  wheelWrap: {
    alignItems: "center",
    marginBottom: verticalScale(8),
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: scale(20),
    marginBottom: verticalScale(20),
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
  },
  legendDot: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
  },
  legendText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: moderateScale(11),
    fontWeight: "600",
  },

  // Aspects list
  aspectsSection: {
    marginBottom: verticalScale(20),
  },
  aspectsTitle: {
    color: "#ffffff",
    fontSize: moderateScale(12),
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: verticalScale(10),
  },
  aspectsList: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingVertical: verticalScale(4),
  },
  aspectsEmpty: {
    color: "rgba(255,255,255,0.5)",
    fontSize: moderateScale(12),
    textAlign: "center",
    paddingVertical: verticalScale(14),
    fontStyle: "italic",
  },
  aspectRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  aspectPlanets: {
    flexDirection: "row",
    alignItems: "center",
    width: scale(68),
    gap: scale(2),
  },
  aspectPSym: {
    fontSize: moderateScale(18),
    width: scale(22),
    textAlign: "center",
  },
  aspectSym: {
    fontSize: moderateScale(15),
    width: scale(20),
    textAlign: "center",
    fontWeight: "700",
  },
  aspectMid: {
    flex: 1,
    paddingHorizontal: scale(8),
  },
  aspectType: {
    fontSize: moderateScale(12),
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  aspectNames: {
    color: C.dimText,
    fontSize: moderateScale(10),
    marginTop: 1,
  },
  aspectOrb: {
    color: C.moonSilver,
    fontSize: moderateScale(11),
    minWidth: scale(40),
    textAlign: "right",
  },

  // Reading cards
  readingCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingVertical: verticalScale(16),
    paddingHorizontal: scale(16),
    marginBottom: verticalScale(14),
  },
  readingLabel: {
    color: "#ffffff",
    fontSize: moderateScale(12),
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: verticalScale(10),
  },
  readingBody: {
    color: "rgba(255,255,255,0.82)",
    fontSize: moderateScale(13),
    lineHeight: moderateScale(20),
  },
  readingLoading: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: verticalScale(8),
    gap: scale(10),
  },
  readingLoadingText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: moderateScale(12),
    fontStyle: "italic",
  },
  readingPlaceholder: {
    color: "rgba(255,255,255,0.35)",
    fontSize: moderateScale(12),
    fontStyle: "italic",
  },
  aspectTable:{

  },
  aspectTableRow: {

  }
});
