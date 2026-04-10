import React from "react";

import { View, Text, StyleSheet } from "react-native";

import { scale, verticalScale, moderateScale } from "@/src/utils/responsive";

import DelalunaContainer from "../shared/delaluna-container.component";
import MoonPhaseImageFrame from "../home/moon-image-view.component";

interface MoonProps {
  phaseName?: string;
  illumination?: number;
  sign?: string;
  horoscopeMoon?: string;
}

export default function MoonView({
  phaseName,
  illumination,
  sign,
  horoscopeMoon,
}: MoonProps) {
  return (
    <View style={styles.container}>
      <MoonPhaseImageFrame
        phaseName={phaseName || "New Moon"}
        illumination={illumination ?? 0}
      />

      <View style={styles.detailsContainer}>
        {phaseName && (
            <Text style={styles.textPhase}>{sign} {phaseName}, {illumination}°</Text>
          
        )}

        {horoscopeMoon && (
          <DelalunaContainer>
            <Text style={styles.text}>{horoscopeMoon}</Text>
          </DelalunaContainer>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    display: "flex",
    width: "100%",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: scale(8),
    paddingBottom: verticalScale(20),
  },
  text: {
    fontSize: moderateScale(14),
    lineHeight: moderateScale(25),
    color: "#FFFFFF",
    textAlign: "center",
  },
  textPhase: {
    fontSize: moderateScale(14),
    lineHeight: moderateScale(25),
    color: "#FFFFFF",
    textAlign: "center",
    fontWeight: "600",
  },
  detailsContainer: {
    width: "100%",
    alignItems: "center",
    gap: scale(4),
  }
});
