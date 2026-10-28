import React from "react";

import { Image, StyleSheet, TouchableOpacity } from "react-native";

import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";
import { router } from "expo-router";
import { ThemedText } from "../themed-text";
import { ThemedView } from "../themed-view";

interface HomeSignsDisplayProps {
  sun: string;
  moon: string;
  rising: string;
  showViewChart?: boolean;
  birthChartReady?: boolean;
}

// The sun / moon / arrow icons are the only thing saying which sign is which;
// without this a screen reader reads "Aries, Leo, Virgo" with no placements.
export function signLabel(placement: "Sun" | "Moon" | "Rising", sign: string): string {
  return sign && sign !== "—" ? `${placement} in ${sign}` : `${placement} sign not available yet`;
}

export default function HomeSignsDisplay({ sun, moon, rising, showViewChart = true, birthChartReady = false }: HomeSignsDisplayProps) {
  const goToBirthchart = () => router.push('/(home)/birth-chart-view');

  return (
    <ThemedView style={[styles.container, !showViewChart && { justifyContent: 'center' }]}>

      <ThemedView style={{ flexDirection: "row", gap: scale(4), alignItems: "flex-start" }}>
        <ThemedView style={styles.signItem} accessible accessibilityLabel={signLabel("Sun", sun)}>
          <Image
            source={require("@/src/assets/main/sun_icon.png")}
            style={[styles.icon]}
          />
          <ThemedText style={styles.text}>{sun}</ThemedText>
        </ThemedView>

        {/* Moon Sign */}
        <ThemedView style={styles.signItem} accessible accessibilityLabel={signLabel("Moon", moon)}>
          <Image
            source={require("@/src/assets/main/moon_icon.png")}
            style={styles.icon}
          />
          <ThemedText style={styles.text}>{moon}</ThemedText>
        </ThemedView>

        {/* Rising Sign */}
        <ThemedView style={styles.signItem} accessible accessibilityLabel={signLabel("Rising", rising)}>
          <Image
            source={require("@/src/assets/main/arrow_upward_icon.png")}
            style={styles.icon}
          />
          <ThemedText style={styles.text}>{rising}</ThemedText>
        </ThemedView>
      </ThemedView>

      {/* Birth Chart */}
      <ThemedView style={{ flexDirection: "row", gap: scale(5), alignItems: "flex-start", justifyContent: "flex-end" }}>
        {showViewChart && (
        <ThemedView style={styles.chartItem}>
          <TouchableOpacity
            onPress={goToBirthchart}
            disabled={!birthChartReady}
            accessibilityRole="button"
            accessibilityState={{ disabled: !birthChartReady, busy: !birthChartReady }}
            hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
          >
            <ThemedText style={[styles.birtChartText, !birthChartReady && styles.birtChartTextDisabled]}>
              {birthChartReady ? "View Chart" : "Chart Loading..."}
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>
      )}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(10),
    gap: scale(2),
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(2),
  },
  chartItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(2),
    justifyContent: "flex-end",
  },
  icon: {
    width: scale(15),
    height: scale(15),
    resizeMode: "contain",
    color: "#FFFFFF",
  },
  text: {
    fontSize: moderateScale(10),
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  birtChartText: {
    fontSize: moderateScale(12),
    color: "#8eeceaff",
    fontWeight: "300",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  birtChartTextDisabled: {
    opacity: 0.4,
  },
});
