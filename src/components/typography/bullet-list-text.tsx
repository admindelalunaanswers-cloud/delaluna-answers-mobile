import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { verticalScale, moderateScale } from "@/src/utils/responsive";
import { renderRichText } from "@/src/utils/rich-text";

interface BulletListProps {
  items: string[];
}

/**
 * A centred list with no markers — the look it has shipped with since it was
 * first written. It once took a `bullet` prop and had a `bullet` style, but
 * never rendered either; both are gone so nothing suggests otherwise. Each item
 * is its own Text, so a screen reader still steps through them one by one.
 */
export function BulletList({ items }: BulletListProps) {
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <View key={index} style={styles.row}>
          <Text style={styles.text}>{renderRichText(item)}</Text>
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
text: {
  flex: 1,
  flexWrap: "wrap",
  fontSize: moderateScale(14),
  lineHeight: moderateScale(22),
  color: "#FFFFFF",
  textAlign: "center",
  includeFontPadding: false,
},
});