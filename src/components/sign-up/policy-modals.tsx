// components/PolicyModals.tsx
import { verticalScale, moderateScale, scale } from '@/src/utils/responsive';
import Markdown from 'react-native-markdown-display';

import React, { useContext, useMemo } from 'react';
import {
  ImageBackground,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  TextStyle,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/src/components/app-text';
import HeaderNav from '@/src/components/shared/header-nav';
import { C } from '@/src/constants/theme';
import { useFontScale } from '@/src/context/accessibility-context';
import { ThemeContext } from '@/src/context/theme-context';
import { scaleStyleMap } from '@/src/utils/text-scale';

// Same bar height HeaderNav draws, which the content is padded below.
const NAV_BAR_HEIGHT = 44;
const MUTED = 'rgba(255,255,255,0.78)';

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
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + verticalScale(NAV_BAR_HEIGHT);
  // A Modal is its own window, so the app's background image doesn't reach it;
  // draw the theme's here, as the screens behind it do.
  const { theme } = useContext(ThemeContext);
  // Markdown draws its own text from these, so Text size is applied here.
  const fontScale = useFontScale();
  const scaledMarkdownStyles = useMemo(() => scaleStyleMap(markdownStyles, fontScale), [fontScale]);
  const rules = {
    link: (node: any, children: any, _parent: any, styles: any) => (
      <Text
        key={node.key}
        style={styles.link}
        // Nested pressable text isn't a link to VoiceOver / TalkBack without this,
        // so it was missing from the rotor's Links list.
        accessibilityRole="link"
        onPress={() => {
          const url: string = node.attributes.href ?? '';
          if (url.startsWith('#') && onLinkPress) {
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
      <View key={node.key} style={styles._VIEW_SAFE_heading1} accessible accessibilityRole="header">
        {children}
      </View>
    ),
    heading2: (node: any, children: any, _parent: any, styles: any) => (
      <View key={node.key} style={styles._VIEW_SAFE_heading2} accessible accessibilityRole="header">
        {children}
      </View>
    ),
    heading3: (node: any, children: any, _parent: any, styles: any) => (
      <View key={node.key} style={styles._VIEW_SAFE_heading3} accessible accessibilityRole="header">
        {children}
      </View>
    ),
  };

  return (
    // onRequestClose: without it the Android back button did nothing here, and
    // Close was the only way out. statusBarTranslucent: on Android the modal
    // otherwise starts below the status bar, and HeaderNav's safe-area inset
    // would be applied twice.
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <ImageBackground source={theme.backgroundImage} style={styles.background} resizeMode="cover">
        <HeaderNav
          title={title}
          leftIconName="close"
          leftAccessibilityLabel={`Close ${title}`}
          onLeftPress={onClose}
        />

        {visible && textContent && (
          <ScrollView
            style={{ marginTop: headerHeight }}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + verticalScale(40) },
            ]}
          >
            <View style={styles.card}>
              <Markdown style={scaledMarkdownStyles} rules={rules}>
                {textContent}
              </Markdown>
            </View>
          </ScrollView>
        )}
      </ImageBackground>
    </Modal>
  );
}

// No fixed heights on anything holding text: a policy has to stay readable at
// the largest system text size.
const styles = StyleSheet.create({
  // The fill shows until the image loads, and wherever a theme has none.
  background: { flex: 1, backgroundColor: C.nebula },
  content: {
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(12),
  },
  // The card treatment the settings screens use (see Accessibility).
  card: {
    padding: scale(16),
    borderRadius: moderateScale(16),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(20,10,45,0.55)',
  },
});

const markdownStyles: Record<string, TextStyle> = {
  body: { color: 'rgba(255,255,255,0.9)', fontSize: moderateScale(15), lineHeight: moderateScale(22) },
  heading1: {
    color: C.goldBright,
    fontSize: moderateScale(22),
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: verticalScale(4),
  },
  heading2: {
    color: C.gold,
    fontSize: moderateScale(14),
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: verticalScale(24),
    marginBottom: verticalScale(8),
  },
  heading3: {
    color: C.gold,
    fontSize: moderateScale(14),
    fontWeight: '600',
    marginTop: verticalScale(16),
    marginBottom: verticalScale(6),
  },
  strong: { color: '#ffffff', fontWeight: '700' },
  // The version line under the title.
  em: { color: MUTED, fontStyle: 'italic' },
  // Turquoise is the app's colour for anything you can act on.
  link: { color: C.turquoise, textDecorationLine: 'underline' },
  bullet_list_icon: { color: C.gold },
  ordered_list_icon: { color: C.gold },
};
