/**
 * consumable-placeholder.component.tsx
 * Mock one-time purchase sheet — used to gate single uses of premium features
 * (birth-chart compare, additional questions) without requiring a full
 * subscription. Connections are NOT sold à la carte: trial = 3, premium = 10,
 * free = 0; the only path past those caps is upgrading to Premium.
 *
 * For 'question' kind, four tier options are shown:
 *   1 pack — $0.99
 *   3 pack — $2.49
 *   5 pack — $3.99
 *   10 pack — $9.99
 *
 * For 'synastry' kind, a single fixed-price unlock is shown.
 *
 * TODO: Wire to RevenueCat consumables once products are live. For now this
 * just simulates a successful purchase and calls `onPurchased` with the
 * quantity selected.
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

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConsumableKind = 'synastry' | 'question';

interface ConsumableTier {
  productId: string;
  quantity: number;
  price: string;
}

interface ConsumablePreset {
  title: string;
  message: string;
  unitLabel: string;          // singular noun, e.g. "connection" / "question"
  unitLabelPlural: string;    // plural noun, e.g. "connections" / "questions"
  icon: keyof typeof Ionicons.glyphMap;
  tiers: ConsumableTier[];
}

// ─── Presets ─────────────────────────────────────────────────────────────────

export const QUESTION_TIERS: ConsumableTier[] = [
  { productId: 'questions_1', quantity: 1, price: '$0.99' },
  { productId: 'questions_3', quantity: 3, price: '$1.99' },
  { productId: 'questions_5', quantity: 5, price: '$3.99' },
];

export const CONSUMABLE_PRESETS: Record<ConsumableKind, ConsumablePreset> = {
  synastry: {
    title: 'Compare Birth Charts',
    message:
      'Unlock a one-time synastry analysis between you and this connection.',
    unitLabel: 'unlock',
    unitLabelPlural: 'unlocks',
    icon: 'sparkles',
    tiers: [{ productId: 'synastry_1', quantity: 1, price: '$0.99' }],
  },
  question: {
    title: 'Ask More Questions',
    message:
      "You've used today's chat. Pick a pack to keep the conversation going.",
    unitLabel: 'question',
    unitLabelPlural: 'questions',
    icon: 'chatbubble-ellipses',
    tiers: QUESTION_TIERS,
  },
};

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  kind: ConsumableKind;
  onClose: () => void;
  /** Called after a successful mock purchase with the quantity bought. */
  onPurchased: (quantity: number) => void;
  /** Optional override of preset title/message. */
  override?: Partial<Pick<ConsumablePreset, 'title' | 'message' | 'icon'>>;
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

  const handleBuy = (tier: ConsumableTier) => {
    onPurchased(tier.quantity);
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

              <View style={s.tiersWrap}>
                {preset.tiers.map((tier) => {
                  const label =
                    tier.quantity === 1
                      ? `1 ${preset.unitLabel}`
                      : `${tier.quantity} ${preset.unitLabelPlural}`;
                  return (
                    <TouchableOpacity
                      key={tier.productId}
                      style={s.tierRow}
                      onPress={() => handleBuy(tier)}
                      activeOpacity={0.85}
                    >
                      <Text style={s.tierLabel}>{label}</Text>
                      <View style={s.tierPricePill}>
                        <Text style={s.tierPrice}>{tier.price}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

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
  tiersWrap: {
    width: '100%',
    marginTop: verticalScale(10),
    gap: verticalScale(8),
  },
  tierRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(14),
    borderRadius: scale(12),
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(188,168,244,0.35)',
  },
  tierLabel: { color: '#fff', fontSize: moderateScale(14), fontWeight: '600' },
  tierPricePill: {
    backgroundColor: 'rgba(255,215,0,0.15)',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(5),
    borderRadius: scale(8),
  },
  tierPrice: {
    color: '#FFD700',
    fontSize: moderateScale(13),
    fontWeight: '800',
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
