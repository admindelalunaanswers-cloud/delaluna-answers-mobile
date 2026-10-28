/**
 * consumable-placeholder.component.tsx
 * IAP chat pack sheet — shown when the user hits their daily chat limit.
 *
 * Pack product IDs:
 *   delaluna.iap.chat_pack_1 / 3 / 5 / 10
 *
 * Store prices are fetched from RevenueCat on open.
 * Falls back to placeholder prices if products are unavailable.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '@/src/components/app-text';

import { Ionicons } from '@expo/vector-icons';
import type { PurchasesStoreProduct } from 'react-native-purchases';
import Purchases from 'react-native-purchases';

import { PRODUCT_IDS, REVENUECAT_ENABLED, purchaseProduct } from '@/src/services/revenuecat.service';
import { Events } from '@/src/services/analytics.service';
import { recordError } from '@/src/services/crashlytics.service';
import { C } from '@/src/constants/theme';
import { moderateScale, scale, verticalScale } from '@/src/utils/responsive';
import { logger } from '@/src/utils/logger';
import { useAnnounce } from '@/src/hooks/use-announce';

// ─── Chat pack tiers ─────────────────────────────────────────────────────────

interface TierDef {
  productId: string;
  quantity: number;
  label: string;
  fallbackPrice: string;
}

const TIER_DEFS: TierDef[] = [
  { productId: PRODUCT_IDS.chatPack1,  quantity: 1,  label: '1 Question',   fallbackPrice: '$0.99' },
  { productId: PRODUCT_IDS.chatPack3,  quantity: 3,  label: '3 Questions',  fallbackPrice: '$2.99' },
  { productId: PRODUCT_IDS.chatPack5,  quantity: 5,  label: '5 Questions',  fallbackPrice: '$3.99' },
  { productId: PRODUCT_IDS.chatPack10, quantity: 10, label: '10 Questions', fallbackPrice: '$9.99' },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful purchase with the quantity bought. */
  onPurchased: (quantity: number) => void;
  /**
   * Optional: called after a successful purchase so the RevenueCat context
   * can re-sync CustomerInfo. Pass `refresh` from `useRevenueCat()`.
   */
  onRefresh?: () => Promise<void>;
  /**
   * Dev builds only: when the store can't sell, grant the pack without a real
   * purchase so the flow can be demoed. Off, the sheet says the store is
   * unavailable instead — it used to "buy" silently, closing with nothing
   * bought, behind placeholder prices that weren't the real ones.
   */
  allowMock?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

const STORE_UNAVAILABLE = "The store isn't available right now. Please try again later.";

export default function ConsumablePlaceholder({ visible, onClose, onPurchased, onRefresh, allowMock = false }: Props) {
  const [selected, setSelected] = useState(TIER_DEFS[1].productId);
  const [storeProducts, setStoreProducts] = useState<Record<string, PurchasesStoreProduct>>({});
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  useAnnounce(errorMsg);

  // Fetch real store products when sheet opens
  useEffect(() => {
    if (!visible) return;
    if (!REVENUECAT_ENABLED) {
      setProductsLoaded(true);
      return;
    }
    let cancelled = false;
    setLoadingProducts(true);
    setProductsLoaded(false);
    setErrorMsg(null);
    (async () => {
      try {
        const productIds = TIER_DEFS.map((t) => t.productId);
        const products = await Purchases.getProducts(productIds);
        if (cancelled) return;
        const map: Record<string, PurchasesStoreProduct> = {};
        for (const p of products) map[p.identifier] = p;
        setStoreProducts(map);
      } catch (e) {
        logger.warn('[ConsumablePlaceholder] failed to fetch products:', e);
        // Non-fatal — fall back to placeholder prices
      } finally {
        if (!cancelled) {
          setLoadingProducts(false);
          setProductsLoaded(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [visible]);

  const handleBuy = useCallback(async () => {
    const tier = TIER_DEFS.find((t) => t.productId === selected);
    if (!tier) return;

    const product = storeProducts[tier.productId];

    // The store can't sell this pack. Mock it only where that is allowed.
    if (!REVENUECAT_ENABLED || !product) {
      if (allowMock) {
        onPurchased(tier.quantity);
        onClose();
      } else {
        setErrorMsg(STORE_UNAVAILABLE);
      }
      return;
    }

    setPurchasing(true);
    setErrorMsg(null);
    try {
      await purchaseProduct(product);
      Events.purchaseCompleted({ product_id: tier.productId });
      await onRefresh?.();
      onPurchased(tier.quantity);
      onClose();
    } catch (e: any) {
      if (e?.userCancelled) return;
      logger.error('[ConsumablePlaceholder] purchase failed', e, 'consumable_purchase');
      recordError(e, 'consumable_purchase');
      Events.purchaseFailed({ product_id: tier.productId, reason: String(e?.message ?? e) });
      setErrorMsg('Purchase failed. Please try again.');
    } finally {
      setPurchasing(false);
    }
  }, [selected, storeProducts, onPurchased, onClose, onRefresh, allowMock]);

  // Real store prices only, unless mocking: a placeholder "$0.99" shown to a
  // real customer is a price the store never offered.
  const priceFor = (tier: TierDef) =>
    storeProducts[tier.productId]?.priceString ?? (allowMock ? tier.fallbackPrice : '');
  const storeUnavailable = !allowMock && productsLoaded && !storeProducts[selected];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* accessible={false} on both: a Pressable is an accessibility element by
          default, so these collapsed the whole sheet — packs, Buy now, Close —
          into one VoiceOver element and nothing in it could be reached. */}
      <Pressable style={s.backdrop} onPress={purchasing ? undefined : onClose} accessible={false}>
        <Pressable style={s.card} onPress={(e) => e.stopPropagation()} accessible={false}>

          {/* Close */}
          <TouchableOpacity
            style={s.closeBtn}
            onPress={onClose}
            hitSlop={12}
            activeOpacity={0.7}
            disabled={purchasing}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={scale(16)} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          {/* Icon */}
          <View style={s.iconWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ionicons name="chatbubble-ellipses" size={scale(26)} color={C.cosmos} />
          </View>

          {/* Heading */}
          <Text style={s.title} accessibilityRole="header">Ask More Questions</Text>
          <Text style={s.message}>
            {"You've used today's chat. Pick a pack to keep going."}
          </Text>

          {/* Tiers */}
          {loadingProducts ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={TEAL} accessibilityLabel="Loading prices" />
            </View>
          ) : (
            <View style={s.tiersWrap} accessibilityRole="radiogroup" accessibilityLabel="Question packs">
              {TIER_DEFS.map((tier) => {
                const isSelected = selected === tier.productId;
                return (
                  <TouchableOpacity
                    key={tier.productId}
                    style={[s.tierRow, isSelected && s.tierRowSelected]}
                    onPress={() => {
                      setSelected(tier.productId);
                      setErrorMsg(null);
                    }}
                    activeOpacity={0.85}
                    disabled={purchasing}
                    // Selection was only a checkmark and a border
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected, disabled: purchasing }}
                    accessibilityLabel={priceFor(tier) ? `${tier.label}, ${priceFor(tier)}` : tier.label}
                  >
                    <View style={[s.radioOuter, isSelected && s.radioOuterSelected]}>
                      {isSelected && <Ionicons name="checkmark" size={scale(11)} color={C.cosmos} />}
                    </View>
                    <Text style={s.tierLabel}>{tier.label}</Text>
                    <Text style={[s.tierPrice, isSelected && s.tierPriceSelected]}>
                      {priceFor(tier)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {errorMsg ? (
            <Text style={s.errorText}>{errorMsg}</Text>
          ) : storeUnavailable ? (
            <Text style={s.errorText}>{STORE_UNAVAILABLE}</Text>
          ) : null}

          <Text style={s.renewNote}>One-time purchase · chat only</Text>

          {/* CTA */}
          <TouchableOpacity
            style={[s.ctaButton, (purchasing || loadingProducts || storeUnavailable) && s.ctaButtonDisabled]}
            onPress={handleBuy}
            activeOpacity={0.85}
            disabled={purchasing || loadingProducts || storeUnavailable}
            accessibilityRole="button"
            // Keeps its name while the spinner replaces the text
            accessibilityLabel="Buy now"
            accessibilityState={{
              disabled: purchasing || loadingProducts || storeUnavailable,
              busy: purchasing,
            }}
          >
            {purchasing ? (
              <ActivityIndicator color={C.cosmos} size="small" />
            ) : (
              <Text style={s.ctaText}>Buy now</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onClose}
            hitSlop={10}
            activeOpacity={0.7}
            disabled={purchasing}
            accessibilityRole="button"
          >
            <Text style={s.cancelText}>Not now</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const BG      = C.deepSpace;
const TEAL    = C.turquoise;
const PLAN_BG = C.starfield;

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
    color: 'rgba(255,255,255,0.75)', // was 0.55
    fontSize: moderateScale(13),
    textAlign: 'center',
    lineHeight: moderateScale(20),
    alignSelf: 'stretch',
  },
  loadingWrap: {
    width: '100%',
    paddingVertical: verticalScale(24),
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: 'rgba(111,255,233,0.08)',
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
    color: 'rgba(255,255,255,0.75)', // was 0.6
    fontSize: moderateScale(14),
    fontWeight: '700',
  },
  tierPriceSelected: { color: '#fff' },
  errorText: {
    color: '#ff6b6b',
    fontSize: moderateScale(12),
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  renewNote: {
    color: 'rgba(255,255,255,0.65)', // was 0.4
    fontSize: moderateScale(11),
    textAlign: 'center',
  },
  ctaButton: {
    width: '100%',
    backgroundColor: C.turquoise,
    borderRadius: scale(28),
    paddingVertical: verticalScale(15),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: verticalScale(4),
  },
  ctaButtonDisabled: { opacity: 0.45 },
  ctaText: { color: C.cosmos, fontSize: moderateScale(16), fontWeight: '700' },
  cancelText: {
    color: 'rgba(255,255,255,0.7)', // was 0.45 — a button label
    fontSize: moderateScale(13),
  },
});
