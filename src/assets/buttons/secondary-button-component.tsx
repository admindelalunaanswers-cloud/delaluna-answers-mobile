import React from "react";
import { Text, TouchableOpacity, StyleSheet } from "react-native";
import { scale, verticalScale, moderateScale } from "@/utils/responsive";

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
    height: verticalScale(50),
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
    color: "#006FFD", // soft turquoise accent (Delaluna palette)
    fontWeight: "700",
  },
});

export default SecondaryButton;
