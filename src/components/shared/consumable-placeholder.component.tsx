/**
 * consumable-placeholder.component.tsx
 * Mock one-time purchase sheet — used to gate single uses of premium features
 * (birth-chart compare, additional connections, additional questions) without
 * requiring a full subscription.
 *
 * TODO: Wire to RevenueCat consumables once products are live. For now this
 * just simulates a successful purchase and calls `onPurchased`.
 */

import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { moderateScale, scale, verticalScale } from '@/src/utils/responsive';

// ─── Presets ─────────────────────────────────────────────────────────────────

export type ConsumableKind = 'synastry' | 'connection' | 'question';

interface ConsumablePreset {
  productId: string;
  title: string;
  message: string;
  price: string;
  ctaLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const CONSUMABLE_PRESETS: Record<ConsumableKind, ConsumablePreset> = {
  synastry: {
    productId: 'synastry_1',
    title: 'Compare Birth Charts',
    message:
      'Unlock a one-time synastry analysis between you and this connection.',
    price: '$0.99',
    ctaLabel: 'Unlock for $0.99',
    icon: 'sparkles',
  },
  connection: {
    productId: 'connections_1',
    title: 'Add Another Connection',
    message:
      "You've reached your connection limit. Add one more without upgrading.",
    price: '$0.99',
    ctaLabel: 'Add for $0.99',
    icon: 'people',
  },
  question: {
    productId: 'questions_1',
    title: 'Ask Another Question',
    message:
      "You've used today's chat. Buy one more question to keep going.",
    price: '$0.99',
    ctaLabel: 'Ask for $0.99',
    icon: 'chatbubble-ellipses',
  },
};

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  kind: ConsumableKind;
  onClose: () => void;
  /** Called after a successful mock purchase. */
  onPurchased: () => void;
  /** Optional override of preset title/message/price. */
  override?: Partial<ConsumablePreset>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ConsumablePlaceholder({
  visible,
  kind,
  onClose,
  onPurchased,
  override,
}: Props) {
  const preset = { ...CONSUMABLE_PRESETS[kind], ...override };

  const handleBuy = () => {
    onPurchased();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.cardWrap} onPress={(e) => e.stopPropagation()}>
          <LinearGradient
            colors={['#8E44AD', '#5BC0BE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.gradientBorder}
          >
            <View style={s.card}>
              <TouchableOpacity
                style={s.closeBtn}
                onPress={onClose}
                hitSlop={12}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={scale(20)} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>

              <View style={s.iconWrap}>
                <Ionicons name={preset.icon} size={scale(26)} color="#BCA8F4" />
              </View>

              <View style={s.badge}>
                <Ionicons name="flash" size={scale(10)} color="#FFD700" />
                <Text style={s.badgeText}>ONE-TIME</Text>
              </View>

              <Text style={s.title}>{preset.title}</Text>
              <Text style={s.message}>{preset.message}</Text>

              <TouchableOpacity
                style={s.buyButton}
                onPress={handleBuy}
                activeOpacity={0.85}
              >
                <Text style={s.buyText}>{preset.ctaLabel}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={onClose} hitSlop={8} activeOpacity={0.7}>
                <Text style={s.cancelText}>Not now</Text>
              </TouchableOpacity>

              <Text style={s.testingHint}>Testing mode — no real charges</Text>
            </View>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 3, 18, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(24),
  },
  cardWrap: { width: '100%', maxWidth: scale(380) },
  gradientBorder: { borderRadius: scale(16), padding: scale(1.5) },
  card: {
    borderRadius: scale(15),
    backgroundColor: 'rgba(13, 8, 42, 0.96)',
    paddingVertical: verticalScale(24),
    paddingHorizontal: scale(20),
    alignItems: 'center',
    gap: verticalScale(8),
  },
  closeBtn: {
    position: 'absolute',
    top: verticalScale(10),
    right: scale(10),
    padding: scale(4),
    zIndex: 1,
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
    fontSize: moderateScale(17),
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
  buyButton: {
    marginTop: verticalScale(12),
    backgroundColor: '#FFD700',
    borderRadius: scale(24),
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(28),
    width: '100%',
    alignItems: 'center',
  },
  buyText: {
    color: '#0A061E',
    fontSize: moderateScale(15),
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  cancelText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: moderateScale(13),
    marginTop: verticalScale(4),
  },
  testingHint: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: moderateScale(10),
    textAlign: 'center',
    marginTop: verticalScale(8),
  },
});
