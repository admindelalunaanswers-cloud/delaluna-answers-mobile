import React from "react";

import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";

import { verticalScale, scale, moderateScale } from "@/src/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

interface HomeSignsDisplayProps {
  sun: string;
  moon: string;
  rising: string;
  showViewChart?: boolean;
  birthChartReady?: boolean;
}

export default function HomeSignsDisplay({ sun, moon, rising, showViewChart = true, birthChartReady = false }: HomeSignsDisplayProps) {
  const goToBirthchart = () => router.push('/(home)/birth-chart-view');

  return (
    <View style={styles.container}>

      <View style={{ flexDirection: "row", gap: scale(4), alignItems: "flex-start" }}>
        <View style={styles.signItem}>
          <Image
            source={require("@/src/assets/main/sun_icon.png")}
            style={[styles.icon]}
          />
          <Text style={styles.text}>{sun}</Text>
        </View>

        {/* Moon Sign */}
        <View style={styles.signItem}>
          <Image
            source={require("@/src/assets/main/moon_icon.png")}
            style={styles.icon}
          />
          <Text style={styles.text}>{moon}</Text>
        </View>

        {/* Rising Sign */}
        <View style={styles.signItem}>
          <Image
            source={require("@/src/assets/main/arrow_upward_icon.png")}
            style={styles.icon}
          />
          <Text style={styles.text}>{rising}</Text>
        </View>
      </View>

      {/* Birth Chart */}
      <View style={{ flexDirection: "row", gap: scale(5), alignItems: "flex-start", justifyContent: "flex-end" }}>
        {showViewChart && (
        <View style={styles.chartItem}>
          <TouchableOpacity onPress={goToBirthchart} disabled={!birthChartReady}>
            <Text style={[styles.birtChartText, !birthChartReady && styles.birtChartTextDisabled]}>
              {birthChartReady ? "View Chart" : "Chart Loading..."}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      </View>
      
      
    </View>
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
