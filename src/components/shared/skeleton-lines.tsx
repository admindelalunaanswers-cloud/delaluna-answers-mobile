import React, { useEffect } from "react";
import { StyleSheet, View, type DimensionValue } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";

interface SkeletonLinesProps {
  lines?: number;
  widths?: DimensionValue[];
  lineHeight?: number;
  spacing?: number;
  color?: string;
}

function PulseLine({
  width,
  delay,
  lineHeight,
  color,
}: {
  width: DimensionValue;
  delay: number;
  lineHeight: number;
  color: string;
}) {
  const opacity = useSharedValue(0.2);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(0.65, { duration: 850, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(opacity);
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        styles.line,
        { width, height: lineHeight, backgroundColor: color },
        animStyle,
      ]}
    />
  );
}

const DEFAULT_WIDTHS: DimensionValue[] = ["100%", "92%", "78%", "85%", "70%"];

export default function SkeletonLines({
  lines = 3,
  widths,
  lineHeight = moderateScale(10),
  spacing = verticalScale(8),
  color = "rgba(255,255,255,0.18)",
}: SkeletonLinesProps) {
  const arr = Array.from({ length: lines }).map(
    (_, i) => widths?.[i] ?? DEFAULT_WIDTHS[i % DEFAULT_WIDTHS.length],
  );

  return (
    <View>
      {arr.map((w, i) => (
        <View
          key={i}
          style={{ marginBottom: i === arr.length - 1 ? 0 : spacing }}
        >
          <PulseLine width={w} delay={i * 140} lineHeight={lineHeight} color={color} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    borderRadius: scale(6),
  },
});
