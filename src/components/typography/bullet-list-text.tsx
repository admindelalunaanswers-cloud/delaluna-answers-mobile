import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { scale, verticalScale, moderateScale } from "@/utils/responsive";

interface BulletListProps {
  items: string[];
  bullet?: string;
}

export function BulletList({ items, bullet = "•" }: BulletListProps) {
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <View key={index} style={styles.row}>
          <Text style={styles.text}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
  width: "100%",
  paddingVertical: verticalScale(12),
},
  row: {
  width: "100%",
  flexDirection: "row",
  alignItems: "center",
  marginBottom: verticalScale(10),
},
  bullet: {
  width: scale(18),
  marginRight: scale(8),
  fontSize: moderateScale(16),
  lineHeight: moderateScale(22),
  color: "#FFFFFF",
},
text: {
  flex: 1,
  flexWrap: "wrap",
  fontSize: moderateScale(14),
  lineHeight: moderateScale(22),
  color: "#FFFFFF",
   textAlign: "center"
},
});