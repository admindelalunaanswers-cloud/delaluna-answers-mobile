import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Image,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/components/app-text';
import { C, R, S } from '@/src/constants/theme';
import type { SocialNetwork } from '@/src/constants/links';
import { useReducedMotion } from '@/src/context/accessibility-context';

/** Long enough for the Modal's window to exist before focus is moved into it. */
const FOCUS_DELAY_MS = 350;

const NETWORKS: { id: SocialNetwork; name: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'instagram', name: 'Instagram', icon: 'logo-instagram' },
  { id: 'tiktok', name: 'TikTok', icon: 'logo-tiktok' },
  { id: 'x', name: 'X', icon: 'logo-x' },
  { id: 'facebook', name: 'Facebook', icon: 'logo-facebook' },
];

export const SHARE_NETWORK_NAMES: Record<SocialNetwork, string> = Object.fromEntries(
  NETWORKS.map((n) => [n.id, n.name]),
) as Record<SocialNetwork, string>;

interface Props {
  visible: boolean;
  /** The app's own re-capture of the screen; null when that failed. */
  imageUri: string | null;
  /** True while a network's share is in flight — buttons ignore taps. */
  busy: boolean;
  onShare: (network: SocialNetwork) => void;
  onNotNow: () => void;
  onOptOut: () => void;
}

export default function SharePromptSheet({
  visible,
  imageUri,
  busy,
  onShare,
  onNotNow,
  onOptOut,
}: Props) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const titleRef = useRef<React.ElementRef<typeof Text>>(null);

  // TalkBack doesn't always move into a Modal by itself; land on the title so
  // the prompt is announced before its buttons.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      const node = titleRef.current ? findNodeHandle(titleRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, FOCUS_DELAY_MS);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? 'none' : 'slide'}
      transparent
      onRequestClose={onNotNow}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropTouch}
          activeOpacity={1}
          onPress={onNotNow}
          accessible={false}
          importantForAccessibility="no"
        />
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + S.md }]}
          accessibilityViewIsModal
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text ref={titleRef} style={styles.title} accessibilityRole="header">
              Loving your reading? Share it
            </Text>
            <TouchableOpacity
              onPress={onNotNow}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={26} color={C.white} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.preview}
                resizeMode="contain"
                accessible
                accessibilityRole="image"
                accessibilityLabel="Preview of your screen"
              />
            ) : null}

            <Text style={styles.subtitle}>
              Tag us so we can see it. We&apos;ll copy a caption with our handle for you.
            </Text>

            <View style={styles.networks}>
              {NETWORKS.map((n) => (
                <TouchableOpacity
                  key={n.id}
                  style={styles.networkButton}
                  onPress={() => onShare(n.id)}
                  disabled={busy}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Share on ${n.name}`}
                  accessibilityState={{ disabled: busy, busy }}
                >
                  <Ionicons name={n.icon} size={26} color={C.white} />
                  <Text style={styles.networkName}>{n.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.footerButton}
                onPress={onNotNow}
                accessibilityRole="button"
              >
                <Text style={styles.footerText}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.footerButton}
                onPress={onOptOut}
                accessibilityRole="button"
              >
                <Text style={styles.footerTextMuted}>Don&apos;t ask again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  backdropTouch: { flex: 1 },
  sheet: {
    backgroundColor: C.deepSpace,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    paddingHorizontal: S.md,
    paddingTop: S.sm,
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: S.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: S.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    flexShrink: 1,
    color: C.white,
    fontSize: 17,
    fontWeight: '600',
    marginRight: S.sm,
  },
  body: {
    paddingTop: S.md,
    gap: S.md,
  },
  preview: {
    alignSelf: 'center',
    width: 120,
    height: 200,
    borderRadius: R.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  subtitle: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  networks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: S.sm,
  },
  networkButton: {
    flexGrow: 1,
    flexBasis: '22%',
    minHeight: 64,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: S.xs,
    paddingVertical: S.sm,
    borderRadius: R.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  networkName: {
    color: C.white,
    fontSize: 12,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: S.sm,
  },
  footerText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '600',
  },
  footerTextMuted: {
    color: C.muted,
    fontSize: 14,
  },
});
