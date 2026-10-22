import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useScaledTextStyle } from "@/src/components/app-text";

interface DateSwitcherProps {
  value: string;        // YYYY-MM-DD
  dates: string[];      // allowed dates
  onChange: (date: string) => void;
}

export default function DateSwitcher({
  value,
  dates,
  onChange,
}: DateSwitcherProps) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  // Animated.Text is react-native's, so it needs Text size applied by hand.
  const dateTextStyle = useScaledTextStyle(styles.dateText);

  const index = dates.indexOf(value);
  const disableLeft = index <= 0;
  const disableRight = index >= dates.length - 1;

  // The arrows keep focus, so the new date is otherwise never read out. Only on
  // a change: the date is already on screen at mount, and announcing it then
  // talks over the screen's own focus.
  const announcedValue = useRef(value);
  useEffect(() => {
    if (announcedValue.current === value) return;
    announcedValue.current = value;
    AccessibilityInfo.announceForAccessibility(formatDate(value));
  }, [value]);

  const goPrevious = () => {
    if (disableLeft) return;
    onChange(dates[index - 1]);
  };

  const goNext = () => {
    if (disableRight) return;
    onChange(dates[index + 1]);
  };

  function formatDate(ymd: string) {
    const [year, month, day] = ymd.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={goPrevious}
        disabled={disableLeft}
        style={styles.iconButton}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Previous day"
        accessibilityState={{ disabled: disableLeft }}
      >
        <Ionicons
          name="chevron-back"
          size={scale(20)}
          color={disableLeft ? "rgba(255,255,255,0.4)" : "#FFFFFF"}
        />
      </TouchableOpacity>

      <Animated.Text style={[dateTextStyle, { opacity: fadeAnim }]}>
        {formatDate(value)}
      </Animated.Text>

      <TouchableOpacity
        onPress={goNext}
        disabled={disableRight}
        style={styles.iconButton}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Next day"
        accessibilityState={{ disabled: disableRight }}
      >
        <Ionicons
          name="chevron-forward"
          size={scale(20)}
          color={disableRight ? "rgba(255,255,255,0.4)" : "#FFFFFF"}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
    paddingHorizontal: scale(13),
    paddingVertical: verticalScale(10),
    backgroundColor: "#0d062803",
    gap: scale(3),
  },
  iconButton: {
    // Was ~28×24pt around a 20pt chevron
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: scale(4),
    paddingVertical: verticalScale(2),
  },
  dateText: {
    color: "#FFFFFF",
    fontSize: moderateScale(20),
    fontWeight: "900",
    textAlign: "center",
  },
});
