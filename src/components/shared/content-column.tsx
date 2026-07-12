import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';

import { MAX_CONTENT_WIDTH } from '@/src/utils/layout';

interface ContentColumnProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Centers content in a MAX_CONTENT_WIDTH column.
 *
 * On phones the view is full-width as usual.
 * On tablets (iPad) it constrains content to a phone-like column centered
 * in the screen — matching the phone experience without stretching edge to edge.
 *
 * Usage:
 *   <ContentColumn>
 *     ...your screen content...
 *   </ContentColumn>
 *
 * For ScrollView content, wrap the children rather than the contentContainerStyle:
 *   <ScrollView contentContainerStyle={styles.scrollContent}>
 *     <ContentColumn style={{ paddingHorizontal: 16 }}>
 *       ...
 *     </ContentColumn>
 *   </ScrollView>
 *
 * Or use getContentPadding(width) on the contentContainerStyle directly for a
 * simpler single-container approach — see src/utils/layout.ts.
 */
export function ContentColumn({ children, style }: ContentColumnProps) {
  return (
    <View style={[styles.column, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
});
