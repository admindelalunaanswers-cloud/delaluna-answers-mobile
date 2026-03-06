// src/components/home/moon-image-view.tsx

import React from "react";
import { StyleSheet, View } from "react-native";

import { getMoonPhaseImage } from "@/src/constants/moonPhaseImages";
import { scale } from "@/src/utils/responsive";


interface MoonPhaseProps {
  phaseName: string;
  illumination: number;
}

export default function MoonPhaseImageFrame({
  phaseName,
}: MoonPhaseProps) {
  const MoonSvg = getMoonPhaseImage(phaseName);

  return (
    <View style={styles.frame}>
      <MoonSvg width={scale(90)} height={scale(90)} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: scale(12),
    width: "100%",
  },
});
