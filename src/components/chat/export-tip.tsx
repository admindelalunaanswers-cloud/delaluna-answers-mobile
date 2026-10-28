/**
 * One-time tip pointing at the chat header's Export button. Shown the first
 * time there is a chat to export, until the user dismisses it or uses Export.
 * The "seen" flag is per device — it is a hint, not account state.
 */

import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '@/src/components/app-text';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

import { C, R, S } from '@/src/constants/theme';
import { MAX_CONTENT_WIDTH } from '@/src/utils/layout';
import { logger } from '@/src/utils/logger';

export const EXPORT_TIP_KEY = 'chat_export_tip_seen_v1';
export const EXPORT_TIP_TEXT = 'Export this chat as text, PDF or an image';

export async function hasSeenExportTip(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(EXPORT_TIP_KEY)) === '1';
  } catch {
    // Unreadable storage: don't nag on every launch.
    return true;
  }
}

/** Fire-and-forget; a failed save only means the tip shows once more. */
export async function markExportTipSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(EXPORT_TIP_KEY, '1');
  } catch (e) {
    logger.error('[chat-export] tip flag save failed', e, 'chat_export_tip_save');
  }
}

const ARROW = 8;

interface Props {
  /** Distance from the top of the screen to the bottom of the header. */
  top: number;
  /** Distance from the right edge of the header row to the Export icon's centre. */
  anchorFromRight: number;
  onDismiss: () => void;
}

export default function ExportTip({ top, anchorFromRight, onDismiss }: Props) {
  // Visually it points at a button; a screen reader user would otherwise only
  // meet it at the very end of the screen, long after the button.
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    AccessibilityInfo.announceForAccessibility(`Tip: ${EXPORT_TIP_TEXT}`);
  }, []);

  return (
    <View style={[styles.wrap, { top }]} pointerEvents="box-none">
      <View style={styles.row} pointerEvents="box-none">
        <View
          style={[styles.arrow, { right: anchorFromRight - ARROW }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View style={styles.bubble}>
          <Text style={styles.text} accessibilityLabel={`Tip: ${EXPORT_TIP_TEXT}`}>
            {EXPORT_TIP_TEXT}
          </Text>
          <TouchableOpacity
            onPress={onDismiss}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss tip"
          >
            <Ionicons name="close" size={20} color={C.muted} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
    elevation: 20,
  },
  // Same width and centring as the header's nav row, so `anchorFromRight`
  // lands on the icon on an iPad too.
  row: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    paddingTop: ARROW,
    paddingHorizontal: S.md,
  },
  arrow: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW,
    borderRightWidth: ARROW,
    borderBottomWidth: ARROW,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: C.turquoise,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    paddingVertical: S.sm + 4,
    paddingHorizontal: S.md,
    borderRadius: R.md,
    borderWidth: 1.5,
    borderColor: C.turquoise,
    backgroundColor: C.void,
    shadowColor: C.cosmos,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  text: {
    flex: 1,
    color: C.white,
    fontSize: 15,
    lineHeight: 20,
  },
});
