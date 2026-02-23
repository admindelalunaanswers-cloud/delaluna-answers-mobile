// src/components/home/moon-image-view.tsx

import { getMoonPhaseImage } from "@/src/constants/moonPhaseImages";
import React from "react";
import { StyleSheet, View, Image } from "react-native";


interface MoonPhaseProps {
  phaseName: string;
  illumination: number;
}

export default function MoonPhaseImageFrame({
  phaseName,
  illumination,
}: MoonPhaseProps) {
  const source = getMoonPhaseImage(phaseName, illumination);

  return (
    <View style={styles.frame}>
      <Image style={styles.image} source={source} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  image: {
    width: 90,
    height: 90,
    resizeMode: "contain",
    justifyContent: "center",
    alignItems: "center",
  },
});
