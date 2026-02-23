import React, { useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { scale, verticalScale, moderateScale } from "@/src/utils/responsive";

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

  const index = dates.indexOf(value);
  const disableLeft = index <= 0;
  const disableRight = index >= dates.length - 1;

  const goPrevious = () => {
    if (disableLeft) return;
    onChange(dates[index - 1]);
  };

  const goNext = () => {
    if (disableRight) return;
    onChange(dates[index + 1]);
  };

  const formatDate = (ymd: string) => {
    const [year, month, day] = ymd.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={goPrevious}
        disabled={disableLeft}
        style={styles.iconButton}
        activeOpacity={0.7}
      >
        <Ionicons
          name="chevron-back"
          size={scale(20)}
          color={disableLeft ? "rgba(255,255,255,0.4)" : "#FFFFFF"}
        />
      </TouchableOpacity>

      <Animated.Text style={[styles.dateText, { opacity: fadeAnim }]}>
        {formatDate(value)}
      </Animated.Text>

      <TouchableOpacity
        onPress={goNext}
        disabled={disableRight}
        style={styles.iconButton}
        activeOpacity={0.7}
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
