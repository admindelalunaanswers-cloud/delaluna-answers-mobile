// components/PolicyModals.tsx
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";
import Markdown from "react-native-markdown-display";

import { Text } from "@/src/components/app-text";
import { C } from "@/src/constants/theme";
import { useFontScale } from "@/src/context/accessibility-context";
import { scaleStyleMap } from "@/src/utils/text-scale";
import { useMemo } from "react";
import {
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextStyle,
  TouchableOpacity,
  View,
} from "react-native";

interface PolicyModalProps {
  visible: boolean;
  onClose: () => void;
  textContent?: string;
  title: string;
  onLinkPress?: (url: string) => void;
}

export default function PolicyModal({
  visible,
  onClose,
  textContent,
  title,
  onLinkPress,
}: PolicyModalProps) {
  // Markdown draws its own text from these, so Text size is applied here.
  const fontScale = useFontScale();
  const scaledMarkdownStyles = useMemo(
    () => scaleStyleMap(markdownStyles, fontScale),
    [fontScale],
  );
  const rules = {
    link: (node: any, children: any, _parent: any, styles: any) => (
      <Text
        key={node.key}
        style={styles.link}
        // Nested pressable text isn't a link to VoiceOver / TalkBack without this,
        // so it was missing from the rotor's Links list.
        accessibilityRole="link"
        onPress={() => {
          const url: string = node.attributes.href ?? "";
          if (url.startsWith("#") && onLinkPress) {
            onLinkPress(url);
          } else {
            Linking.openURL(url);
          }
        }}
      >
        {children}
      </Text>
    ),
    // Markdown headings render as plain views; mark them so the rotor can jump
    // between sections of a long policy.
    heading1: (node: any, children: any, _parent: any, styles: any) => (
      <View
        key={node.key}
        style={styles._VIEW_SAFE_heading1}
        accessible
        accessibilityRole="header"
      >
        {children}
      </View>
    ),
    heading2: (node: any, children: any, _parent: any, styles: any) => (
      <View
        key={node.key}
        style={styles._VIEW_SAFE_heading2}
        accessible
        accessibilityRole="header"
      >
        {children}
      </View>
    ),
    heading3: (node: any, children: any, _parent: any, styles: any) => (
      <View
        key={node.key}
        style={styles._VIEW_SAFE_heading3}
        accessible
        accessibilityRole="header"
      >
        {children}
      </View>
    ),
  };

  return (
    // onRequestClose: without it the Android back button did nothing here, and
    // Close was the only way out.
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel={`Close ${title}`}
          >
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>

        {visible && textContent && (
          <ScrollView contentContainerStyle={styles.textContainer}>
            <Markdown style={scaledMarkdownStyles} rules={rules}>
              {textContent}
            </Markdown>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? verticalScale(60) : verticalScale(20),
    backgroundColor: C.deepSpace,
  },
  header: {
    paddingVertical: verticalScale(16),
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  title: {
    fontSize: moderateScale(18),
    color: C.white,
    fontWeight: "600",
    textAlign: "center",
  },
  closeButton: {
    position: "absolute",
    right: scale(16),
    top: verticalScale(16),
    padding: scale(8),
  },
  closeText: {
    color: C.turquoise,
    fontSize: moderateScale(16),
    fontWeight: "500",
  },
  textContainer: {
    padding: scale(16),
  },
});

const markdownStyles: Record<string, TextStyle> = {
  body: {
    color: "rgba(255,255,255,0.85)",
    fontSize: moderateScale(15),
    lineHeight: moderateScale(22),
  },
  heading1: {
    color: C.white,
    fontSize: moderateScale(22),
    fontWeight: "bold",
    marginBottom: verticalScale(10),
    alignSelf: "center",
  },
  heading2: {
    color: C.white,
    fontSize: moderateScale(20),
    fontWeight: "bold",
    marginTop: verticalScale(16),
    alignSelf: "center",
  },
  heading3: {
    color: C.white,
    fontSize: moderateScale(18),
    fontWeight: "600",
    marginTop: verticalScale(12),
    alignSelf: "center",
  },
  strong: { fontWeight: "bold" },
  link: { color: C.turquoise, textDecorationLine: "underline" },
};
