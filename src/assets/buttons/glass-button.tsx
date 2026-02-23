import React from "react";
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { scale, verticalScale, moderateScale } from "@/src/utils/responsive";

interface GlassButtonProps {
  title: string;
  onPress: () => void;
}

export const GlassButton: React.FC<GlassButtonProps> = ({ title, onPress }) => (
  <Pressable onPress={onPress} style={styles.pressable}>
    <LinearGradient
      colors={["rgba(255,255,255,0.5)", "rgba(255,255,255,0.07)"]}
      locations={[0.0115, 0.9891]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.gradient}
    >
      <Text style={styles.text}>{title}</Text>
    </LinearGradient>
  </Pressable>
);

const styles = StyleSheet.create<{
  pressable: ViewStyle;
  gradient: ViewStyle;
  text: TextStyle;
}>({
  pressable: {
    alignItems: "center",
    justifyContent: "center",
  },
  gradient: {
    width: scale(200),
    height: verticalScale(50),
    borderRadius: scale(25),
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#FFFFFF",
    fontSize: moderateScale(16),
    fontWeight: "600",
    letterSpacing: 0.4,
  },
});

export default GlassButton;
