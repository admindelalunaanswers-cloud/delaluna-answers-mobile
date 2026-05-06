/**
 * paywall.tsx
 * Mock paywall for testing — shows real pricing & products so the client
 * can preview the purchase flow without RevenueCat backend.
 *
 * TODO: Replace with real RevenueCat paywall once backend is configured.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';

import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRevenueCat, type DevPlan } from '@/src/context/revenuecat-context';
import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';

// ─── Subscription plans ──────────────────────────────────────────────────────

interface SubPlan {
  id: string;
  label: string;
  period: string;
  price: string;
  perMonth: string;
  badge?: string;
  highlight?: boolean;
}

// Pricing placeholder — both tiers shown at $10 until final pricing is confirmed.
const SUBSCRIPTIONS: SubPlan[] = [
  {
    id: 'com.delaluna.premium.monthly',
    label: 'Monthly',
    period: '1 month',
    price: '$10/mo',
    perMonth: '$10/mo',
    highlight: true,
  },
  {
    id: 'com.delaluna.premium.weekly',
    label: 'Weekly',
    period: '1 week',
    price: '$10/wk',
    perMonth: '$10/wk',
  },
];

// ─── Consumables ─────────────────────────────────────────────────────────────

interface Consumable {
  id: string;
  label: string;
  price: string;
}

const CONSUMABLES: Consumable[] = [
  { id: 'questions_1',  label: '1 Extra Question',     price: '$0.99' },
  { id: 'questions_3',  label: '3 Extra Questions',    price: '$2.49' },
  { id: 'questions_5',  label: '5 Extra Questions',    price: '$3.99' },
  { id: 'questions_10', label: '10 Extra Questions',   price: '$9.99' },
  { id: 'synastry_1',   label: 'Synastry Analysis (1 person)', price: '$0.99' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function PaywallScreen() {
  const { devPlan, setDevPlan } = useRevenueCat();
  const insets = useSafeAreaInsets();
  const [selectedSub, setSelectedSub] = useState(SUBSCRIPTIONS[0].id);

  const handleSubscribe = () => {
    setDevPlan('premium');
    Alert.alert('Subscribed (Test)', `You selected the ${SUBSCRIPTIONS.find((s) => s.id === selectedSub)?.label} plan.\n\nPremium is now active.`);
    router.back();
  };

  const handleBuyConsumable = (item: Consumable) => {
    Alert.alert('Purchased (Test)', `${item.label} for ${item.price}`);
  };

  const handleFreeTrial = () => {
    setDevPlan('freeTrial');
    Alert.alert('Free Trial Activated (Test)', 'You now have 5-day full premium access.');
    router.back();
  };

  const handleResetToFree = () => {
    setDevPlan('auto');
    Alert.alert('Plan Reset (Test)', 'Back to the free plan.');
    router.back();
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={12}>
          <Ionicons name="close" size={scale(24)} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Delaluna Answers Premium</Text>
        <View style={{ width: scale(24) }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <Ionicons name="sparkles" size={scale(40)} color="#FFD700" style={s.hero} />
        <Text style={s.heroTitle}>Unlock Full Access</Text>
        <Text style={s.heroSub}>Transits, connections, chat & past/future horoscopes</Text>

        {/* Current plan indicator */}
        <View style={s.currentPlanRow}>
          <Text style={s.currentPlanLabel}>Current plan:</Text>
          <Text style={[s.currentPlanValue, devPlan === 'premium' && { color: '#FFD700' }, devPlan === 'freeTrial' && { color: '#6FFFE9' }]}>
            {devPlan === 'premium' ? 'Premium'
              : devPlan === 'freeTrial' ? 'Free Trial'
              : devPlan === 'free' ? 'Free (forced)'
              : 'Free'}
          </Text>
        </View>

        {/* ── Subscription cards ── */}
        <Text style={s.sectionTitle}>SUBSCRIPTION PLANS</Text>
        <View style={s.cards}>
          {SUBSCRIPTIONS.map((plan) => {
            const selected = selectedSub === plan.id;
            return (
              <TouchableOpacity
                key={plan.id}
                style={[s.card, selected && s.cardSelected, plan.highlight && selected && s.cardHighlight]}
                onPress={() => setSelectedSub(plan.id)}
                activeOpacity={0.8}
              >
                <View style={s.cardTop}>
                  <View style={s.radioOuter}>
                    {selected && <View style={s.radioInner} />}
                  </View>
                  <View style={s.cardInfo}>
                    <View style={s.cardLabelRow}>
                      <Text style={[s.cardLabel, selected && s.cardLabelActive]}>{plan.label}</Text>
                      {plan.badge && (
                        <View style={[s.badgePill, plan.highlight ? s.badgeGold : s.badgeTeal]}>
                          <Text style={s.badgePillText}>{plan.badge}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.cardPeriod}>{plan.period}</Text>
                  </View>
                  <View style={s.cardPricing}>
                    <Text style={s.cardPrice}>{plan.price}</Text>
                    {plan.perMonth !== plan.price && (
                      <Text style={s.cardPerMonth}>{plan.perMonth}</Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Subscribe CTA */}
        <TouchableOpacity style={s.ctaButton} onPress={handleSubscribe} activeOpacity={0.85}>
          <Ionicons name="sparkles" size={scale(16)} color="#0A061E" />
          <Text style={s.ctaText}>Subscribe Now</Text>
        </TouchableOpacity>

        {/* Free trial CTA */}
        {devPlan !== 'freeTrial' && devPlan !== 'premium' && (
          <TouchableOpacity style={s.trialButton} onPress={handleFreeTrial} activeOpacity={0.8}>
            <Ionicons name="time-outline" size={scale(15)} color="#6FFFE9" />
            <Text style={s.trialText}>Start 5-Day Free Trial</Text>
          </TouchableOpacity>
        )}

        {/* ── Consumables ── */}
        <Text style={[s.sectionTitle, { marginTop: verticalScale(28) }]}>ONE-TIME PURCHASES</Text>
        {CONSUMABLES.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={s.consumableRow}
            onPress={() => handleBuyConsumable(item)}
            activeOpacity={0.8}
          >
            <Text style={s.consumableLabel}>{item.label}</Text>
            <View style={s.consumablePricePill}>
              <Text style={s.consumablePrice}>{item.price}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Reset to free */}
        {devPlan !== 'auto' && devPlan !== 'free' && (
          <TouchableOpacity style={s.resetButton} onPress={handleResetToFree} activeOpacity={0.7}>
            <Text style={s.resetText}>Reset to Free Plan</Text>
          </TouchableOpacity>
        )}

        <Text style={s.testingHint}>Testing mode — no real charges</Text>
        <View style={{ height: verticalScale(32) }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A061E' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(12),
  },
  headerTitle: { color: '#fff', fontSize: moderateScale(16), fontWeight: '700' },
  scroll: { paddingHorizontal: scale(24), alignItems: 'center' },

  // Hero
  hero: { marginTop: verticalScale(8) },
  heroTitle: { color: '#fff', fontSize: moderateScale(24), fontWeight: '800', marginTop: verticalScale(8) },
  heroSub: { color: 'rgba(255,255,255,0.5)', fontSize: moderateScale(14), textAlign: 'center', marginTop: verticalScale(4) },

  // Current plan
  currentPlanRow: { flexDirection: 'row', alignItems: 'center', gap: scale(6), marginTop: verticalScale(16), marginBottom: verticalScale(8) },
  currentPlanLabel: { color: 'rgba(255,255,255,0.4)', fontSize: moderateScale(12) },
  currentPlanValue: { color: '#888', fontSize: moderateScale(12), fontWeight: '700' },

  // Section
  sectionTitle: { color: 'rgba(255,255,255,0.35)', fontSize: moderateScale(11), fontWeight: '700', letterSpacing: 1.2, alignSelf: 'flex-start', marginTop: verticalScale(16), marginBottom: verticalScale(8) },

  // Sub cards
  cards: { width: '100%', gap: verticalScale(10) },
  card: {
    borderRadius: scale(14),
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: verticalScale(14),
    paddingHorizontal: scale(14),
  },
  cardSelected: { borderColor: 'rgba(111,255,233,0.5)', backgroundColor: 'rgba(111,255,233,0.06)' },
  cardHighlight: { borderColor: 'rgba(255,215,0,0.5)', backgroundColor: 'rgba(255,215,0,0.06)' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: scale(12) },
  radioOuter: { width: scale(20), height: scale(20), borderRadius: scale(10), borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: scale(10), height: scale(10), borderRadius: scale(5), backgroundColor: '#6FFFE9' },
  cardInfo: { flex: 1 },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: scale(8) },
  cardLabel: { color: '#fff', fontSize: moderateScale(15), fontWeight: '700' },
  cardLabelActive: { color: '#6FFFE9' },
  cardPeriod: { color: 'rgba(255,255,255,0.4)', fontSize: moderateScale(12), marginTop: verticalScale(1) },
  cardPricing: { alignItems: 'flex-end' },
  cardPrice: { color: '#fff', fontSize: moderateScale(15), fontWeight: '700' },
  cardPerMonth: { color: 'rgba(255,255,255,0.4)', fontSize: moderateScale(11), marginTop: verticalScale(1) },

  // Badges
  badgePill: { paddingHorizontal: scale(8), paddingVertical: verticalScale(2), borderRadius: scale(6) },
  badgeGold: { backgroundColor: 'rgba(255,215,0,0.2)' },
  badgeTeal: { backgroundColor: 'rgba(111,255,233,0.15)' },
  badgePillText: { color: '#FFD700', fontSize: moderateScale(9), fontWeight: '800', letterSpacing: 0.6 },

  // CTA
  ctaButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8), width: '100%', backgroundColor: '#FFD700', borderRadius: scale(28), paddingVertical: verticalScale(14), marginTop: verticalScale(20) },
  ctaText: { color: '#0A061E', fontSize: moderateScale(16), fontWeight: '800' },

  // Trial
  trialButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(6), marginTop: verticalScale(12), paddingVertical: verticalScale(10), paddingHorizontal: scale(20), borderRadius: scale(24), borderWidth: 1, borderColor: 'rgba(111,255,233,0.4)', backgroundColor: 'rgba(111,255,233,0.08)' },
  trialText: { color: '#6FFFE9', fontSize: moderateScale(14), fontWeight: '600' },

  // Consumables
  consumableRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: verticalScale(12), paddingHorizontal: scale(14), borderRadius: scale(12), backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginTop: verticalScale(8) },
  consumableLabel: { color: '#fff', fontSize: moderateScale(13), fontWeight: '500', flex: 1, marginRight: scale(8) },
  consumablePricePill: { backgroundColor: 'rgba(188,168,244,0.15)', paddingHorizontal: scale(12), paddingVertical: verticalScale(5), borderRadius: scale(8) },
  consumablePrice: { color: '#BCA8F4', fontSize: moderateScale(13), fontWeight: '700' },

  // Reset
  resetButton: { marginTop: verticalScale(20) },
  resetText: { color: 'rgba(255,100,100,0.7)', fontSize: moderateScale(13), textDecorationLine: 'underline' },

  // Hint
  testingHint: { color: 'rgba(255,255,255,0.2)', fontSize: moderateScale(11), textAlign: 'center', marginTop: verticalScale(16) },
});
