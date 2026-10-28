import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';

import { BlurView } from 'expo-blur';

import { scale } from '@/src/utils/responsive';

import PremiumUnlock from './premium-unlock.component';

interface PaygateOverlayProps {
  locked: boolean;
  children: React.ReactNode;
  onUnlock?: () => void;
  unlockTitle?: string;
  unlockMessage?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Wraps any content with a blurred paygate overlay when `locked` is true.
 * The underlying content remains faintly visible to tease the user.
 *
 * Usage:
 *   <PaygateOverlay locked={!isPremium} onUnlock={handleUpgrade}>
 *     <PremiumContent />
 *   </PaygateOverlay>
 */
export default function PaygateOverlay({
  locked,
  children,
  onUnlock,
  unlockTitle,
  unlockMessage,
  style,
}: PaygateOverlayProps) {
  return (
    <View style={[styles.container, style]}>
      {/* The blur only hides content from sight. Without this, VoiceOver / TalkBack
          read the locked content in full — a free user hears the premium reading. */}
      <View
        style={styles.content}
        accessibilityElementsHidden={locked}
        importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>

      {locked && (
        <BlurView
          intensity={50}
          tint="dark"
          style={StyleSheet.absoluteFill}
          accessibilityViewIsModal
        >
          {/* Extra tint so content is clearly obscured on Android where blur may be weaker */}
          <View style={styles.tint} />
          <View style={styles.cta}>
            <PremiumUnlock
              onUnlock={onUnlock}
              title={unlockTitle}
              message={unlockMessage}
            />
          </View>
        </BlurView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  // flexGrow, not flex: 1 — fills a container given flex: 1 (every current
  // caller), and still sizes to content in one that isn't, where flex: 1's
  // zero basis would collapse it.
  content: {
    flexGrow: 1,
  },
  tint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 6, 30, 0.45)',
  },
  cta: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(24),
  },
});
