import { scale, verticalScale, moderateScale } from "@/src/utils/responsive";
import React from "react";
import { Text, TouchableOpacity, StyleSheet } from "react-native";

interface SecondaryButtonProps {
  title: string;
  onPress?: () => void;
  linkString?: string;
}

const SecondaryButton: React.FC<SecondaryButtonProps> = ({
  title,
  onPress,
  linkString,
}) => {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={styles.button}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={styles.text}>
        {title}
        {linkString && <Text style={styles.linkText}>{` ${linkString}`}</Text>}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: scale(8),
    minHeight: verticalScale(50), // min, not fixed — clipped the label at large text sizes
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(20),
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  text: {
    fontSize: moderateScale(16),
    color: "#FFFFFF",
    fontWeight: "500",
    textAlign: "center",
  },
  linkText: {
    fontSize: moderateScale(16),
    color: "#6FFFE9", // soft turquoise accent (Delaluna palette); #006FFD was under 4.5:1 on the dark cards
    fontWeight: "700",
  },
});

export default SecondaryButton;
