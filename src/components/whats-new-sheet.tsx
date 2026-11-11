import React, { useCallback, useRef } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassButton } from '@/src/assets/buttons/glass-button';
import { Text } from '@/src/components/app-text';
import { C, R, S } from '@/src/constants/theme';
import type { WhatsNewItem, WhatsNewRelease } from '@/src/constants/whats-new';
import { useReducedMotion } from '@/src/context/accessibility-context';
import type { WhatsNewCloseReason } from '@/src/hooks/use-whats-new';

interface Props {
  visible: boolean;
  release: WhatsNewRelease;
  /** Already filtered to the user's plan. */
  items: readonly WhatsNewItem[];
  onClose: (reason: WhatsNewCloseReason) => void;
  /** An item's link. The caller closes the sheet and navigates. */
  onItemPress: (item: WhatsNewItem) => void;
}

/**
 * Presentational only: when it shows, and what closing it records, belong to
 * the caller (use-whats-new.ts on Home; local state on Profile).
 */
export default function WhatsNewSheet({ visible, release, items, onClose, onItemPress }: Props) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const titleRef = useRef<React.ElementRef<typeof Text>>(null);

  // Start the screen reader on the title rather than the version pill above it.
  // The delay lets the modal's own focus move land first, or it wins.
  const focusTitle = useCallback(() => {
    setTimeout(() => {
      const tag = titleRef.current ? findNodeHandle(titleRef.current) : null;
      if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
    }, 150);
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'fade' : 'slide'}
      onShow={focusTitle}
      onRequestClose={() => onClose('back')}
    >
      <View style={styles.backdrop}>
        {/* Tap outside is for touch. To a screen reader it would be an empty,
            unnamed element; "Got it" and the Android back button cover it. */}
        <TouchableOpacity
          style={styles.backdropTouch}
          activeOpacity={1}
          onPress={() => onClose('backdrop')}
          accessible={false}
          importantForAccessibility="no"
        />
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + S.md }]}
          accessibilityViewIsModal
        >
          <View style={styles.handle} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />

          <View style={styles.header}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>{release.versionLabel}</Text>
            </View>
            <View style={styles.titleRow}>
              <Ionicons
                name="sparkles-outline"
                size={22}
                color={C.gold}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <Text ref={titleRef} style={styles.title} accessibilityRole="header">
                {release.title}
              </Text>
            </View>
            <Text style={styles.subtitle}>{release.subtitle}</Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {items.map((item) => (
              <View key={item.id} style={styles.card}>
                <View
                  style={styles.iconTile}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Ionicons name={item.icon} size={22} color={C.purpleLight} />
                </View>
                <View style={styles.cardBody}>
                  {/* Title and body read as one element. Not the whole card:
                      grouping it would swallow the link button inside. */}
                  <View accessible accessibilityLabel={`${item.title}. ${item.body}`}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardText}>{item.body}</Text>
                  </View>
                  {item.cta ? (
                    <TouchableOpacity
                      style={styles.cta}
                      onPress={() => onItemPress(item)}
                      hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
                      accessibilityRole="link"
                      accessibilityLabel={`${item.cta.label}: ${item.title}`}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.ctaText}>{item.cta.label}</Text>
                      <Ionicons
                        name="arrow-forward"
                        size={14}
                        color={C.turquoise}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <GlassButton title="Got it" onPress={() => onClose('button')} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,1,5,0.62)',
    justifyContent: 'flex-end',
  },
  backdropTouch: { flex: 1 },
  sheet: {
    backgroundColor: C.deepSpace,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    borderTopWidth: 1,
    borderColor: 'rgba(185,154,224,0.28)',
    paddingTop: S.sm,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: R.pill,
    backgroundColor: C.purpleDim,
  },
  header: {
    paddingHorizontal: S.lg,
    paddingTop: S.md,
    paddingBottom: S.sm,
    gap: S.sm,
  },
  pill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.45)',
    borderRadius: R.pill,
    paddingHorizontal: 10,
    paddingVertical: S.xs,
  },
  pillText: {
    color: C.goldBright,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
  },
  title: {
    flexShrink: 1,
    color: C.white,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '700',
  },
  subtitle: {
    color: C.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  // flexGrow/Shrink rather than flex: 1 — a zero basis would collapse the list
  // inside a sheet that only has a maxHeight.
  scroll: { flexGrow: 0, flexShrink: 1 },
  list: {
    paddingHorizontal: 20,
    paddingTop: S.sm,
    paddingBottom: S.md,
    gap: S.md - 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: C.starfield,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: 'rgba(185,154,224,0.16)',
    padding: S.md,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: R.md,
    backgroundColor: C.purpleDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flexShrink: 1, flexGrow: 1, gap: S.xs },
  cardTitle: {
    color: C.white,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
  },
  cardText: {
    color: C.moonSilver,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  cta: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.xs,
    minHeight: 44,
    paddingHorizontal: S.xs,
  },
  ctaText: {
    color: C.turquoise,
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: S.lg,
    paddingTop: S.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(185,154,224,0.12)',
    alignItems: 'center',
  },
});
