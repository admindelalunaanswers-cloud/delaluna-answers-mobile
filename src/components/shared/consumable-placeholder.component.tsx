/**
 * consumable-placeholder.component.tsx
 * Mock one-time purchase sheet — gates additional chat questions when the
 * daily limit is reached.
 *
 * Tiers:
 *   1 question  — $0.99
 *   3 questions — $2.49
 *   5 questions — $3.99
 *   10 questions — $9.99
 *
 * TODO: Wire to RevenueCat consumables once products are live.
 */

import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { moderateScale, scale, verticalScale } from '@/src/utils/responsive';

// ─── Tiers ───────────────────────────────────────────────────────────────────

interface ConsumableTier {
  productId: string;
  quantity: number;
  label: string;
  price: string;
}

export const QUESTION_TIERS: ConsumableTier[] = [
  { productId: 'questions_1',  quantity: 1,  label: '1 Extra Question',   price: '$0.99' },
  { productId: 'questions_3',  quantity: 3,  label: '3 Extra Questions',  price: '$2.49' },
  { productId: 'questions_5',  quantity: 5,  label: '5 Extra Questions',  price: '$3.99' },
  { productId: 'questions_10', quantity: 10, label: '10 Extra Questions', price: '$9.99' },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful mock purchase with the quantity bought. */
  onPurchased: (quantity: number) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ConsumablePlaceholder({ visible, onClose, onPurchased }: Props) {
  const [selected, setSelected] = useState(QUESTION_TIERS[1].productId);

  const handleBuy = () => {
    const tier = QUESTION_TIERS.find((t) => t.productId === selected)!;
    onPurchased(tier.quantity);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={(e) => e.stopPropagation()}>

          {/* Close */}
          <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={12} activeOpacity={0.7}>
            <Ionicons name="close" size={scale(16)} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          {/* Icon */}
          <View style={s.iconWrap}>
            <Ionicons name="chatbubble-ellipses" size={scale(26)} color="#fff" />
          </View>

          {/* Heading */}
          <Text style={s.title}>Ask More Questions</Text>
          <Text style={s.message}>
            {"You've used today's chat. Pick a pack to keep the conversation going."}
          </Text>

          {/* Tier selector */}
          <View style={s.tiersWrap}>
            {QUESTION_TIERS.map((tier) => {
              const isSelected = selected === tier.productId;
              return (
                <TouchableOpacity
                  key={tier.productId}
                  style={[s.tierRow, isSelected && s.tierRowSelected]}
                  onPress={() => setSelected(tier.productId)}
                  activeOpacity={0.85}
                >
                  <View style={[s.radioOuter, isSelected && s.radioOuterSelected]}>
                    {isSelected && <Ionicons name="checkmark" size={scale(11)} color="#fff" />}
                  </View>
                  <Text style={s.tierLabel}>{tier.label}</Text>
                  <Text style={[s.tierPrice, isSelected && s.tierPriceSelected]}>
                    {tier.price}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* One-time notice */}
          <Text style={s.renewNote}>One-time purchase — no subscription</Text>

          {/* CTA */}
          <TouchableOpacity style={s.ctaButton} onPress={handleBuy} activeOpacity={0.85}>
            <Text style={s.ctaText}>Buy now</Text>
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity onPress={onClose} hitSlop={10} activeOpacity={0.7}>
            <Text style={s.cancelText}>Not now</Text>
          </TouchableOpacity>

          <Text style={s.testingHint}>Testing mode — no real charges</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const BG      = '#1A0B3B';
const TEAL    = '#3EC9C5';
const PLAN_BG = '#261550';

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 3, 18, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(24),
  },
  card: {
    width: '100%',
    maxWidth: scale(380),
    borderRadius: scale(20),
    backgroundColor: BG,
    paddingVertical: verticalScale(28),
    paddingHorizontal: scale(22),
    alignItems: 'center',
    gap: verticalScale(10),
  },
  closeBtn: {
    position: 'absolute',
    top: verticalScale(14),
    right: scale(14),
    width: scale(28),
    height: scale(28),
    borderRadius: scale(14),
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  iconWrap: {
    width: scale(56),
    height: scale(56),
    borderRadius: scale(28),
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(4),
  },
  title: {
    color: '#fff',
    fontSize: moderateScale(20),
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: moderateScale(13),
    textAlign: 'center',
    lineHeight: moderateScale(20),
    alignSelf: 'stretch',
  },
  tiersWrap: {
    width: '100%',
    backgroundColor: PLAN_BG,
    borderRadius: scale(16),
    padding: scale(8),
    gap: verticalScale(6),
    marginTop: verticalScale(4),
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(12),
    borderRadius: scale(12),
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  tierRowSelected: {
    borderColor: TEAL,
    backgroundColor: 'rgba(62,201,197,0.08)',
  },
  radioOuter: {
    width: scale(22),
    height: scale(22),
    borderRadius: scale(11),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: TEAL,
    backgroundColor: TEAL,
  },
  tierLabel: {
    flex: 1,
    color: '#fff',
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
  tierPrice: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: moderateScale(14),
    fontWeight: '700',
  },
  tierPriceSelected: { color: '#fff' },
  renewNote: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: moderateScale(11),
    textAlign: 'center',
  },
  ctaButton: {
    width: '100%',
    backgroundColor: '#6B3FA0',
    borderRadius: scale(28),
    paddingVertical: verticalScale(15),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: verticalScale(4),
  },
  ctaText: { color: '#fff', fontSize: moderateScale(16), fontWeight: '700' },
  cancelText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: moderateScale(13),
  },
  testingHint: {
    color: 'rgba(255,255,255,0.18)',
    fontSize: moderateScale(10),
    textAlign: 'center',
  },
});
