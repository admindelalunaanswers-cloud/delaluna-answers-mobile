import React from "react";
import {
  TouchableOpacity,
  StyleSheet,
  TouchableOpacityProps,
  ViewStyle,
  TextStyle,
  StyleProp,
} from "react-native";
import { Text } from "@/src/components/app-text";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { scale, verticalScale, moderateScale } from "@/src/utils/responsive";

interface Props extends TouchableOpacityProps {
  title: string;
  style?: StyleProp<ViewStyle>;
}

export default function PrimaryButton({ title, onPress, style, ...rest }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.wrapper, style]}
      {...rest}
    >
      {/* Outer gradient border — same tone as GlassButton */}
      <LinearGradient
        colors={["rgba(255,255,255,0.5)", "rgba(255,255,255,0.07)"]}
        locations={[0.0115, 0.9891]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.border}
      >
        {/* Frosted glass surface */}
        <BlurView intensity={50} tint="dark" style={styles.glass}>
          {/* Subtle vertical highlight */}
          <LinearGradient
            colors={["rgba(255,255,255,0.25)", "rgba(255,255,255,0.05)"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.text}>{title.toUpperCase()}</Text>
        </BlurView>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create<{
  wrapper: ViewStyle;
  border: ViewStyle;
  glass: ViewStyle;
  text: TextStyle;
}>({
  wrapper: {
    width: scale(327),
    // min, not fixed: the label grows with the device and in-app text size.
    minHeight: verticalScale(54),
    borderRadius: scale(40),
  },
  border: {
    // flexGrow, not flex: 1 — flex's zero basis would size the button by its
    // minHeight alone and let a larger label overflow it.
    flexGrow: 1,
    borderRadius: scale(40),
    padding: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  glass: {
    flexGrow: 1,
    borderRadius: scale(40),
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(16),
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  text: {
    color: "#FFFFFF",
    fontSize: moderateScale(16),
    fontWeight: "700",
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
