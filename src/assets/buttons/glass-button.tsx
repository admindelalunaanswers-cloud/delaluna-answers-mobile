import React from "react";
import { Pressable, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { Text } from "@/src/components/app-text";
import { LinearGradient } from "expo-linear-gradient";
import { scale, verticalScale, moderateScale } from "@/src/utils/responsive";

interface GlassButtonProps {
  title: string;
  onPress: () => void;
  /**
   * Real disabled state, announced to screen readers. Callers used to fake it
   * with a wrapping `opacity` + `pointerEvents="none"`, which VoiceOver still
   * read as an active button that did nothing.
   */
  disabled?: boolean;
  /** An action is in flight. */
  busy?: boolean;
}

export const GlassButton: React.FC<GlassButtonProps> = ({ title, onPress, disabled = false, busy = false }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={[styles.pressable, disabled && styles.disabled]}
    accessibilityRole="button"
    accessibilityState={{ disabled, busy }}
  >
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
  disabled: ViewStyle;
  gradient: ViewStyle;
  text: TextStyle;
}>({
  pressable: {
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.5,
  },
  gradient: {
    // min, not fixed: the label clipped at large text sizes
    minWidth: scale(200),
    minHeight: verticalScale(50),
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(8),
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
