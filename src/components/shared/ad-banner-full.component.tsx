import React, { useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Text } from '@/src/components/app-text';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { moderateScale, scale, verticalScale } from '@/src/utils/responsive';
import { C, S } from '@/src/constants/theme';
import { BodyText } from '@/src/components/typography/body-text';
import { TitleText } from '@/src/components/typography/title-text';

interface AdBannerFullProps {
  /** Primary headline */
  title?: string;
  /** Supporting line beneath title */
  subtitle?: string;
  /** Ionicons glyph name shown on the left */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Button label — omit to hide the button */
  ctaLabel?: string;
  onPress?: () => void;
  /** Tapping × hides the banner */
  onDismiss?: () => void;
}

/**
 * Full-width ad strip — edge-to-edge, no horizontal padding or border radius.
 * Drop anywhere in a scroll view or screen body.
 *
 * Usage:
 *   <AdBannerFull
 *     icon="sparkles"
 *     title="Unlock Your Full Birth Chart"
 *     subtitle="Premium readings, ad-free."
 *     ctaLabel="Upgrade"
 *     onPress={handleUpgrade}
 *     onDismiss={handleDismiss}
 *   />
 */
export default function AdBannerFull({
  title,
  subtitle,
  icon = 'sparkles',
  ctaLabel,
  onPress,
  onDismiss,
}: AdBannerFullProps) {
  const isPlaceholder = !title && !subtitle && !ctaLabel;

  const slideY = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.timing(slideY, {
      toValue: 0,
      duration: 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slideY]);

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ translateY: slideY }] }]}>
      <LinearGradient
        colors={['#8E44AD', C.gold, '#5BC0BE']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientBorder}
      >
        <View style={[styles.surface, isPlaceholder && styles.placeholderSurface]}>
          {isPlaceholder ? (
            <View style={styles.placeholderContent}>
              <BodyText style={styles.placeholderLabel}>Ad Goes Here</BodyText>
            </View>
          ) : (
            <>
              {/* Icon pill */}
              <View style={styles.iconWrap}>
                <Ionicons name={icon} size={scale(20)} color={C.goldBright} />
              </View>

              {/* Copy */}
              <View style={styles.copy}>
                {title ? (
                  <TitleText style={styles.adTitle}>{title}</TitleText>
                ) : null}
                {subtitle ? (
                  <BodyText style={styles.adSubtitle}>{subtitle}</BodyText>
                ) : null}
              </View>

              {/* CTA */}
              {ctaLabel ? (
                <TouchableOpacity style={styles.ctaButton} onPress={onPress} activeOpacity={0.8} accessibilityRole="button">
                  <LinearGradient
                    colors={[C.gold, C.goldBright]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.ctaGradient}
                  >
                    <Text style={styles.ctaText}>{ctaLabel}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : null}

              {/* Dismiss */}
              {onDismiss ? (
                <TouchableOpacity
                  style={styles.dismissButton}
                  onPress={onDismiss}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss"
                >
                  <Ionicons name="close" size={scale(14)} color={C.muted} />
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const BANNER_HEIGHT = verticalScale(58);

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },

  gradientBorder: {
    paddingTop: scale(1),
    paddingBottom: scale(1),
  },

  surface: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(13, 8, 42, 0.94)',
    // min, not fixed: the title + subtitle clipped at large text sizes
    minHeight: BANNER_HEIGHT,
    paddingVertical: S.xs,
    paddingHorizontal: S.md,
    gap: S.sm,
  },

  placeholderSurface: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(212, 168, 83, 0.3)',
    justifyContent: 'center',
  },

  placeholderContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  placeholderLabel: {
    color: C.muted,
    fontSize: moderateScale(12),
    letterSpacing: 2,
    textTransform: 'uppercase',
    opacity: 0.6,
  },

  iconWrap: {
    width: scale(36),
    height: scale(36),
    borderRadius: 999,
    backgroundColor: 'rgba(212, 168, 83, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  copy: {
    flex: 1,
    justifyContent: 'center',
    gap: verticalScale(2),
  },
  adTitle: {
    color: C.white,
    fontSize: moderateScale(12),
    letterSpacing: 0.5,
  },
  adSubtitle: {
    color: C.muted,
    fontSize: moderateScale(10),
    lineHeight: moderateScale(14),
  },

  ctaButton: {
    flexShrink: 0,
  },
  ctaGradient: {
    borderRadius: 999,
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(14),
  },
  ctaText: {
    color: C.cosmos,
    fontSize: moderateScale(12),
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  dismissButton: {
    flexShrink: 0,
    width: scale(24),
    height: scale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
