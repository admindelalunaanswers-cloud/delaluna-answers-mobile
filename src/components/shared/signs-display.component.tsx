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
  const goToBirthchart = () => router.replace("/(supporting)/birth-chart.screen");

  return (
    <View style={styles.container}>
      {/* Sun Sign */}
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

      {/* Birth Chart */}
      {showViewChart && (
        <View style={styles.signItem}>
          <TouchableOpacity onPress={goToBirthchart} disabled={!birthChartReady}>
            <Text style={[styles.birtChartText, !birthChartReady && styles.birtChartTextDisabled]}>
              {birthChartReady ? "View Chart" : "Chart Loading..."}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(10),
    gap: scale(5),
    alignSelf: "stretch",
  },
  signItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(5),

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
  listText: {

  },
});
