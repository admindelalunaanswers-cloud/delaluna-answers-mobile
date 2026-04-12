import React from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HeaderNav from "@/src/components/shared/header-nav";
import { calculateSynastry, Aspect } from "@/src/services/astroEngine";
import { TestingStore } from "@/src/stores/testing-store";
import { scale, verticalScale, moderateScale } from "@/src/utils/responsive";
import { summarizeSynastry } from "@/src/utils/synastry";

const NAV_BAR_HEIGHT = 44;

// ─── Colors ──────────────────────────────────────────────────────────────────

const NATURE_COLORS: Record<string, string> = {
  harmonious: "#41FF88",
  challenging: "#FF3B3B",
  neutral: "#FFDD00",
  minor: "#9098b8",
};

const SIGN_ICONS = {
  sun: require("@/src/assets/main/sun_icon.png"),
  moon: require("@/src/assets/main/moon_icon.png"),
  rising: require("@/src/assets/main/arrow_upward_icon.png"),
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function SignRow({ icon, value }: { icon: any; value?: string }) {
  return (
    <View style={styles.signRow}>
      <Image
        source={icon}
        style={styles.signIcon}
        resizeMode="contain"
        tintColor="rgba(255,255,255,0.6)"
      />
      <Text style={styles.signValue} numberOfLines={1}>{value || "\u2014"}</Text>
    </View>
  );
}

function AspectRow({ aspect, highlighted }: { aspect: Aspect; highlighted?: boolean }) {
  const color = NATURE_COLORS[aspect.nature] ?? "rgba(255,255,255,0.5)";
  const orbDeg = Math.floor(aspect.orb);
  const orbMin = Math.floor((aspect.orb % 1) * 60);

  return (
    <View style={[styles.aspectRow, highlighted && styles.aspectRowHighlighted]}>
      <View style={styles.aspectSymbols}>
        <Text style={[styles.planetSymbol, { color: "rgba(255,255,255,0.85)" }]}>{aspect.symbol1}</Text>
        <Text style={[styles.aspectSymbol, { color }]}>{aspect.aspectSymbol}</Text>
        <Text style={[styles.planetSymbol, { color: "rgba(255,255,255,0.85)" }]}>{aspect.symbol2}</Text>
      </View>
      <View style={styles.aspectInfo}>
        <Text style={[styles.aspectType, { color }]}>{aspect.type}</Text>
        <Text style={styles.aspectPlanets}>{aspect.planet1} / {aspect.planet2}</Text>
      </View>
      <Text style={styles.aspectOrb}>{orbDeg}°{String(orbMin).padStart(2, "0")}'</Text>
    </View>
  );
}

function CountPill({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <View style={[styles.countPill, { borderColor: color }]}>
      <Text style={[styles.countNumber, { color }]}>{count}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SynastryAnalysisScreen() {
  const payload = TestingStore.getSynastryAnalysis();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + verticalScale(NAV_BAR_HEIGHT);

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
  const aspects = calculateSynastry(chartA.planets, chartB.planets);

  const { keyAspects, harmonious, neutral, challenging } = summarizeSynastry(aspects);

  const sunA = chartA.planets.find((p) => p.name === "Sun");
  const moonA = chartA.planets.find((p) => p.name === "Moon");
  const sunB = chartB.planets.find((p) => p.name === "Sun");
  const moonB = chartB.planets.find((p) => p.name === "Moon");

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
          {/* Names */}
          <Text style={styles.namesText}>{nameA}  &  {nameB}</Text>

          {/* Big Three side by side */}
          <View style={styles.bigThreeCard}>
            <Text style={styles.sectionLabel}>BIG THREE</Text>
            <View style={styles.signsContainer}>
              <View style={styles.signsCol}>
                <Text style={styles.signPersonLabel}>{nameA}</Text>
                <SignRow icon={SIGN_ICONS.sun} value={sunA?.sign} />
                <SignRow icon={SIGN_ICONS.moon} value={moonA?.sign} />
                <SignRow icon={SIGN_ICONS.rising} value={chartA.ascendant.sign} />
              </View>
              <View style={styles.signsDivider} />
              <View style={styles.signsCol}>
                <Text style={styles.signPersonLabel}>{nameB}</Text>
                <SignRow icon={SIGN_ICONS.sun} value={sunB?.sign} />
                <SignRow icon={SIGN_ICONS.moon} value={moonB?.sign} />
                <SignRow icon={SIGN_ICONS.rising} value={chartB.ascendant.sign} />
              </View>
            </View>
          </View>

          {/* Compatibility overview */}
          <Text style={styles.sectionLabel}>COMPATIBILITY OVERVIEW</Text>
          <View style={styles.countRow}>
            <CountPill count={harmonious} label="Harmonious" color={NATURE_COLORS.harmonious} />
            <CountPill count={neutral} label="Neutral" color={NATURE_COLORS.neutral} />
            <CountPill count={challenging} label="Challenging" color={NATURE_COLORS.challenging} />
          </View>

          {/* Key connections */}
          {keyAspects.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>KEY CONNECTIONS</Text>
              <View style={styles.aspectList}>
                {keyAspects.map((a, i) => (
                  <AspectRow key={i} aspect={a} highlighted />
                ))}
              </View>
            </>
          )}

          {/* All aspects */}
          <Text style={styles.sectionLabel}>ALL ASPECTS ({aspects.length})</Text>
          <View style={styles.aspectList}>
            {aspects.length === 0 ? (
              <Text style={styles.noAspects}>No major aspects found.</Text>
            ) : (
              aspects.map((a, i) => <AspectRow key={i} aspect={a} />)
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
    paddingTop: verticalScale(20),
    paddingBottom: verticalScale(48),
  },
  namesText: {
    color: "#B8A3FF",
    fontSize: moderateScale(18),
    fontWeight: "600",
    textAlign: "center",
    marginBottom: verticalScale(16),
  },
  sectionLabel: {
    color: "#FFFFFF",
    fontSize: moderateScale(12),
    fontWeight: "600",
    letterSpacing: 1.5,
    marginBottom: verticalScale(10),
    textAlign: "center",
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: moderateScale(14),
    textAlign: "center",
  },

  // Big Three
  bigThreeCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: scale(12),
    padding: scale(14),
    marginBottom: verticalScale(20),
  },
  signsContainer: {
    flexDirection: "row",
    justifyContent: "center",
  },
  signsCol: {
    flex: 0,
    minWidth: scale(120),
    alignItems: "center",
    gap: verticalScale(6),
  },
  signsDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: scale(12),
  },
  signPersonLabel: {
    color: "#B8A3FF",
    fontSize: moderateScale(12),
    fontWeight: "600",
    marginBottom: verticalScale(4),
    textAlign: "center",
  },
  signRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
  },
  signIcon: {
    width: scale(16),
    height: scale(16),
    flexShrink: 0,
  },
  signValue: {
    color: "rgba(255,255,255,0.8)",
    fontSize: moderateScale(13),
    flexShrink: 1,
  },

  // Count pills
  countRow: {
    flexDirection: "row",
    gap: scale(8),
    marginBottom: verticalScale(20),
  },
  countPill: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: scale(12),
    borderWidth: 1,
    paddingVertical: verticalScale(12),
  },
  countNumber: {
    fontSize: moderateScale(26),
    fontWeight: "800",
    lineHeight: moderateScale(30),
  },
  countLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: moderateScale(9),
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: verticalScale(2),
  },

  // Aspects
  aspectList: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    marginBottom: verticalScale(20),
  },
  aspectRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(10),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  aspectRowHighlighted: {
    backgroundColor: "rgba(184,163,255,0.1)",
  },
  aspectSymbols: {
    flexDirection: "row",
    alignItems: "center",
    width: scale(68),
    gap: 2,
  },
  planetSymbol: {
    fontSize: moderateScale(17),
    width: scale(22),
    textAlign: "center",
  },
  aspectSymbol: {
    fontSize: moderateScale(14),
    width: scale(20),
    textAlign: "center",
    fontWeight: "700",
  },
  aspectInfo: {
    flex: 1,
    paddingHorizontal: scale(8),
  },
  aspectType: {
    fontSize: moderateScale(12),
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  aspectPlanets: {
    color: "rgba(255,255,255,0.4)",
    fontSize: moderateScale(10),
    marginTop: 1,
  },
  aspectOrb: {
    color: "rgba(255,255,255,0.6)",
    fontSize: moderateScale(11),
    minWidth: scale(40),
    textAlign: "right",
  },
  noAspects: {
    color: "rgba(255,255,255,0.5)",
    fontSize: moderateScale(13),
    textAlign: "center",
    padding: scale(20),
  },
});
