import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { moderateScale, scale, verticalScale } from '@/src/utils/responsive';

interface PremiumUnlockProps {
  onUnlock?: () => void;
  title?: string;
  message?: string;
}

/**
 * Standalone premium CTA card — appears inside PaygateOverlay or on its own.
 */
export default function PremiumUnlock({
  onUnlock,
  title = 'Premium Content',
  message = 'Unlock this and more with a premium membership.',
}: PremiumUnlockProps) {
  return (
    <LinearGradient
      colors={['#8E44AD', '#5BC0BE']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradientBorder}
    >
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={scale(26)} color="#BCA8F4" />
        </View>

        <View style={styles.badge}>
          <Ionicons name="sparkles" size={scale(10)} color="#FFD700" />
          <Text style={styles.badgeText}>PREMIUM</Text>
          <Ionicons name="sparkles" size={scale(10)} color="#FFD700" />
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        <TouchableOpacity style={styles.button} onPress={onUnlock} activeOpacity={0.8}>
          <Text style={styles.buttonText}>Unlock Now</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientBorder: {
    borderRadius: scale(16),
    padding: scale(1.5),
    width: '100%',
  },
  card: {
    borderRadius: scale(15),
    backgroundColor: 'rgba(13, 8, 42, 0.92)',
    paddingVertical: verticalScale(24),
    paddingHorizontal: scale(20),
    alignItems: 'center',
    gap: verticalScale(8),
  },
  iconWrap: {
    width: scale(52),
    height: scale(52),
    borderRadius: scale(26),
    backgroundColor: 'rgba(142, 68, 173, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(4),
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: scale(20),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(3),
  },
  badgeText: {
    color: '#FFD700',
    fontSize: moderateScale(10),
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: {
    color: '#FFFFFF',
    fontSize: moderateScale(16),
    fontWeight: '700',
    textAlign: 'center',
    marginTop: verticalScale(2),
    alignSelf: 'stretch',
  },
  message: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: moderateScale(13),
    textAlign: 'center',
    lineHeight: moderateScale(20),
    alignSelf: 'stretch',
  },
  button: {
    marginTop: verticalScale(8),
    backgroundColor: '#8E44AD',
    borderRadius: scale(24),
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(28),
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: moderateScale(14),
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
