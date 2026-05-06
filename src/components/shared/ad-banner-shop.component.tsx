import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { BodyText } from '@/src/components/typography/body-text';
import { TitleText } from '@/src/components/typography/title-text';
import { C, R, S } from '@/src/constants/theme';
import { moderateScale, scale, verticalScale } from '@/src/utils/responsive';

const DELALUNA_URL = 'https://www.delalunaanswers.com';

interface AdBannerShopProps {
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  /** Override the default Delaluna URL */
  url?: string;
  onDismiss?: () => void;
}

/**
 * Ad banner that links to delalunaanswers.com. Delaluna headshot sits in a
 * circular frame on the left; the whole banner is tappable.
 */
export default function AdBannerShop({
  title = 'DELALUNA — TAROT READER',
  subtitle = 'What your situation is revealing...',
  ctaLabel = 'Talk to Me',
  url = DELALUNA_URL,
  onDismiss,
}: AdBannerShopProps) {
  const slideY = useRef(new Animated.Value(80)).current;

  useEffect(() => {
    Animated.timing(slideY, {
      toValue: 0,
      duration: 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slideY]);

  const handleOpen = () => {
    Linking.openURL(url).catch((e) => console.error('AdBannerShop open failed', e));
  };

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ translateY: slideY }] }]}>
      <LinearGradient
        colors={['#8E44AD', C.gold, '#5BC0BE']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientBorder}
      >
        <TouchableOpacity
          style={styles.surface}
          onPress={handleOpen}
          activeOpacity={0.85}
        >
          <View style={styles.avatarFrame}>
            <Image
              source={require('@/src/assets/dlla-branded/delaluna.png')}
              style={styles.avatarImage}
              resizeMode="cover"
            />
          </View>

          <View style={styles.copy}>
            <TitleText style={styles.adTitle}>{title}</TitleText>
            {subtitle ? (
              <BodyText style={styles.adSubtitle}>{subtitle}</BodyText>
            ) : null}
          </View>

          {ctaLabel ? (
            <View style={styles.ctaButton} pointerEvents="none">
              <LinearGradient
                colors={[C.gold, C.goldBright]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaGradient}
              >
                <Text style={styles.ctaText}>{ctaLabel}</Text>
                <Ionicons
                  name="arrow-forward"
                  size={scale(12)}
                  color={C.cosmos}
                  style={styles.ctaIcon}
                />
              </LinearGradient>
            </View>
          ) : null}

          {onDismiss ? (
            <TouchableOpacity style={styles.dismissButton} onPress={onDismiss} hitSlop={8}>
              <Ionicons name="close" size={scale(14)} color={C.muted} />
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );
}

const BANNER_HEIGHT = verticalScale(72);
const AVATAR_SIZE = scale(54);

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    paddingHorizontal: S.md,
    paddingBottom: S.sm,
  },
  gradientBorder: {
    borderRadius: R.lg,
    padding: scale(1),
  },
  surface: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(13, 8, 42, 0.94)',
    borderRadius: R.lg - 1,
    minHeight: BANNER_HEIGHT,
    paddingHorizontal: S.sm,
    paddingVertical: S.xs,
    gap: S.sm,
  },
  avatarFrame: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    borderColor: C.gold,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: 'rgba(212, 168, 83, 0.12)',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  copy: {
    flex: 1,
    justifyContent: 'center',
    gap: verticalScale(2),
  },
  adTitle: {
    color: C.white,
    fontSize: moderateScale(13),
    letterSpacing: 0.5,
  },
  adSubtitle: {
    color: C.muted,
    fontSize: moderateScale(11),
    lineHeight: moderateScale(15),
  },
  ctaButton: {
    flexShrink: 0,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: R.pill,
    paddingVertical: verticalScale(7),
    paddingHorizontal: scale(14),
    gap: scale(4),
  },
  ctaText: {
    color: C.cosmos,
    fontSize: moderateScale(12),
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  ctaIcon: {
    marginLeft: scale(2),
  },
  dismissButton: {
    flexShrink: 0,
    width: scale(24),
    height: scale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
