import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { scale, verticalScale } from "@/utils/responsive";

type Variant = "default" | "highlight" | "subtle";

interface DelalunaContainerProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: Variant;
}

/**
 * 🌙 DelalunaContainer — base UI wrapper for cards, boxes, and sections
 * Supports multiple variants with gradient borders or subtle backgrounds.
 */
export default function DelalunaContainer({
  children,
  style,
  variant = "default",
}: DelalunaContainerProps) {
  if (variant === "highlight") {
    // 💫 Glowing border (Premium / Focused)
    return (
      <LinearGradient
        colors={["#8E44AD", "#6FFFE9"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradientBorder, style]}
      >
        <View style={styles.innerGlow}>{children}</View>
      </LinearGradient>
    );
  }

  if (variant === "subtle") {
    // 🪶 Soft version for background sections
    return <View style={[styles.subtleContainer, style]}>{children}</View>;
  }

  // 🪐 Default Delaluna style
  return <View style={[styles.defaultContainer, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  // 🪐 Default (your Figma style)
  defaultContainer: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(16),
    gap: scale(8),
    borderRadius: scale(12),
    borderWidth: 1.5,
    borderColor: "rgba(142, 68, 173, 0.6)",
    //backgroundColor: "rgba(255, 255, 255, 0.05)",
  },

  // 💫 Highlight / Premium Glow
  gradientBorder: {
    borderRadius: scale(12),
    padding: scale(1.5), // Border thickness
  },
  innerGlow: {
    borderRadius: scale(12),
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(16),
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },

  // 🪶 Subtle version
  subtleContainer: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(16),
    gap: scale(8),
    borderRadius: scale(12),
    
  },
});
