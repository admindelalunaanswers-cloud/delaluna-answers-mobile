import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

type SectionName =
  | "quote"
  | "advice"
  | "dos"
  | "donts"
  | "affirmation"
  | "tarot"
  | "message"
  | "moon"
  | "retrograde"
  | "newLove"
  | "returns"
  | "warning"
  | "luckyNumbers";

// Icon mapping for each section
const SECTION_ICONS: Partial<
  Record<SectionName, { name: keyof typeof Ionicons.glyphMap; color?: string }>
> = {
  quote: { name: "chatbubble-outline", color: "#5BC0BE" },
  advice: { name: "bulb-outline", color: "#F4A261" },
  dos: { name: "checkmark-circle-outline", color: "#2A9D8F" },
  donts: { name: "close-circle-outline", color: "#E76F51" },
  affirmation: { name: "sparkles-outline", color: "#E63946" },
  tarot: { name: "sparkles-outline", color: "#9D4EDD" },
  message: { name: "send-outline", color: "#06FFA5" },
  moon: { name: "moon-outline", color: "#F1FAEE" },
  retrograde: { name: "planet-outline", color: "#8E44AD" },
  newLove: { name: "heart-outline", color: "#FF69B4" },
  returns: { name: "repeat-outline", color: "#FCA311" },
  luckyNumbers: { name: "dice-outline", color: "#FFD60A" },
  warning: { name: "alert-circle-outline", color: "#FF5252" },
};

interface SectionTitleProps {
  sectionName: SectionName;
  title: string;
  showIcon?: boolean;
}

export default function SectionTitle({
  sectionName,
  title,
  showIcon = true,
}: SectionTitleProps) {
  const iconConfig = SECTION_ICONS[sectionName];
  const iconSize = scale(20);

  if (!title) return null;

  return (
    // A header, so the VoiceOver rotor / TalkBack headings can jump between
    // sections instead of swiping through every line of a long reading.
    <View
      style={styles.titleContainer}
      accessible
      accessibilityRole="header"
      accessibilityLabel={title}
    >
      {showIcon && iconConfig && (
        <Ionicons name={iconConfig.name} size={iconSize} color={"#f9f9f9ff"} />
      )}
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: scale(10),
    marginBottom: verticalScale(6),
    paddingBottom: verticalScale(20),
  },
  title: {
    fontSize: moderateScale(16),
    fontWeight: "900",
    color: "#5BC0BE",
  },
});
