import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { moderateScale, scale, verticalScale } from '@/src/utils/responsive';
import { C, R, S } from '@/src/constants/theme';
import { BodyText } from '@/src/components/typography/body-text';
import { TitleText } from '@/src/components/typography/title-text';

interface AdBannerProps {
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
 * Lower-third ad strip — place directly above the tab bar.
 *
 * Defaults to a placeholder when no ad content is provided.
 *
 * Usage:
 *   <AdBanner
 *     icon="sparkles"
 *     title="Unlock Your Full Birth Chart"
 *     subtitle="Premium readings, ad-free."
 *     ctaLabel="Upgrade"
 *     onPress={handleUpgrade}
 *     onDismiss={handleDismiss}
 *   />
 */
export default function AdBanner({
  title,
  subtitle,
  icon = 'sparkles',
  ctaLabel,
  onPress,
  onDismiss,
}: AdBannerProps) {
  const isPlaceholder = !title && !subtitle && !ctaLabel;

  // Slide in from below on mount
  const slideY = useRef(new Animated.Value(80)).current;

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
      {/* Outer gradient border */}
      <LinearGradient
        colors={['#8E44AD', C.gold, '#5BC0BE']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientBorder}
      >
        {/* Inner surface */}
        <View style={[styles.surface, isPlaceholder && styles.placeholderSurface]}>
          {isPlaceholder ? (
            /* ── Placeholder state ── */
            <View style={styles.placeholderContent}>
              <BodyText style={styles.placeholderLabel}>Ad Goes Here</BodyText>
            </View>
          ) : (
            /* ── Live ad content ── */
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
    paddingHorizontal: S.md,
    paddingBottom: S.sm,
  },

  // Gradient border shell
  gradientBorder: {
    borderRadius: R.lg,
    padding: scale(1),
  },

  // Dark inner surface
  surface: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(13, 8, 42, 0.94)',
    borderRadius: R.lg - 1,
    // min, not fixed: the title + subtitle clipped at large text sizes
    minHeight: BANNER_HEIGHT,
    paddingVertical: S.xs,
    paddingHorizontal: S.sm,
    gap: S.sm,
  },

  // Placeholder variant — dashed look via borderStyle
  placeholderSurface: {
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 83, 0.3)',
    borderStyle: 'dashed',
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

  // Icon pill
  iconWrap: {
    width: scale(36),
    height: scale(36),
    borderRadius: R.pill,
    backgroundColor: 'rgba(212, 168, 83, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Copy area
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

  // CTA button
  ctaButton: {
    flexShrink: 0,
  },
  ctaGradient: {
    borderRadius: R.pill,
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(14),
  },
  ctaText: {
    color: C.cosmos,
    fontSize: moderateScale(12),
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  // Dismiss ×
  dismissButton: {
    flexShrink: 0,
    width: scale(24),
    height: scale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
