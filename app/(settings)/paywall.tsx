/**
 * paywall.tsx
 * Mock paywall — mirrors the branded RevenueCat paywall layout so the client
 * preview matches the real purchase flow.
 *
 * TODO: Replace with real RevenueCat paywall once backend is configured.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';

import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRevenueCat } from '@/src/context/revenuecat-context';
import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';

const PRIVACY_POLICY_URL = 'https://admindelalunaanswers-cloud.github.io/delaluna-legal/';
const TERMS_OF_USE_URL   = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

// ─── Plans ───────────────────────────────────────────────────────────────────

interface SubPlan {
  id: string;
  label: string;
  price: string;
}

const SUBSCRIPTIONS: SubPlan[] = [
  { id: 'delaluna.sub.weekly',  label: 'Delaluna Premium - Weekly',  price: '$9.99'  },
  { id: 'delaluna.sub.monthly', label: 'Delaluna Premium - Monthly', price: '$24.99' },
];

const FEATURES = [
  'Daily personalized horoscopes',
  'In-depth birth chart readings',
  'Live transit & planet alerts',
  'Chat with expert astrologers',
  'Ad-free premium readings & tools',
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function PaywallScreen() {
  const { setDevPlan, presentPaywall } = useRevenueCat();
  const insets = useSafeAreaInsets();
  const [selectedSub, setSelectedSub] = useState(SUBSCRIPTIONS[1].id);

  // Android: present the real RevenueCat native paywall and go back when dismissed.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    presentPaywall().finally(() => router.back());
  }, [presentPaywall]);

  if (Platform.OS === 'android') {
    return (
      <View style={[s.container, s.androidLoader]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  const handleSubscribe = () => {
    setDevPlan('premium');
    Alert.alert(
      'Subscribed (Test)',
      `You selected the ${SUBSCRIPTIONS.find((p) => p.id === selectedSub)?.label} plan.\n\nPremium is now active.`,
    );
    router.back();
  };

  const handleRestorePurchases = () => {
    Alert.alert('Restore Purchases', 'No previous purchases found.');
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Close button */}
      <TouchableOpacity
        style={s.closeBtn}
        onPress={() => router.back()}
        activeOpacity={0.8}
        hitSlop={10}
      >
        <Ionicons name="close" size={scale(18)} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: verticalScale(24) + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* App icon */}
        <Image
          source={require('@/src/assets/dlla-branded/delaluna_app_icon.png')}
          style={s.appIcon}
          resizeMode="contain"
        />

        {/* Title */}
        <Text style={s.title}>Unlock Delaluna Answers{'\n'}Premium</Text>

        {/* Feature checklist */}
        <View style={s.featureList}>
          {FEATURES.map((feature) => (
            <View key={feature} style={s.featureRow}>
              <View style={s.checkCircle}>
                <Ionicons name="checkmark" size={scale(13)} color="#fff" />
              </View>
              <Text style={s.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        {/* Plan selector */}
        <View style={s.planContainer}>
          {SUBSCRIPTIONS.map((plan) => {
            const selected = selectedSub === plan.id;
            return (
              <TouchableOpacity
                key={plan.id}
                style={[s.planRow, selected && s.planRowSelected]}
                onPress={() => setSelectedSub(plan.id)}
                activeOpacity={0.85}
              >
                <View style={[s.radioOuter, selected && s.radioOuterSelected]}>
                  {selected && (
                    <Ionicons name="checkmark" size={scale(12)} color="#fff" />
                  )}
                </View>
                <Text style={[s.planLabel, selected && s.planLabelSelected]}>
                  {plan.label}
                </Text>
                <Text style={[s.planPrice, selected && s.planPriceSelected]}>
                  {plan.price}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Auto-renew notice */}
        <Text style={s.renewNote}>Auto-renews until canceled</Text>

        {/* Subscribe CTA */}
        <TouchableOpacity style={s.ctaButton} onPress={handleSubscribe} activeOpacity={0.85}>
          <Text style={s.ctaText}>Subscribe now!</Text>
        </TouchableOpacity>

        {/* Skip */}
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={10}>
          <Text style={s.skipText}>Skip for now</Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={s.footer}>
          <TouchableOpacity onPress={handleRestorePurchases} activeOpacity={0.7}>
            <Text style={s.footerLink}>Restore Purchases</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL(TERMS_OF_USE_URL)} activeOpacity={0.7}>
            <Text style={s.footerLink}>Terms</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_POLICY_URL)} activeOpacity={0.7}>
            <Text style={s.footerLink}>Privacy</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.testingHint}>Testing mode — no real charges</Text>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const BG = '#1A0B3B';
const TEAL = '#3EC9C5';
const PLAN_BG = '#261550';

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  androidLoader: { justifyContent: 'center', alignItems: 'center' },

  closeBtn: {
    position: 'absolute',
    top: verticalScale(52),
    right: scale(18),
    zIndex: 10,
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: {
    paddingHorizontal: scale(24),
    alignItems: 'center',
    paddingTop: verticalScale(20),
  },

  appIcon: {
    width: scale(88),
    height: scale(88),
    borderRadius: scale(20),
    marginTop: verticalScale(16),
    marginBottom: verticalScale(20),
  },

  title: {
    color: '#fff',
    fontSize: moderateScale(24),
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: moderateScale(32),
    marginBottom: verticalScale(24),
  },

  featureList: { width: '100%', gap: verticalScale(12), marginBottom: verticalScale(28) },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: scale(12) },
  checkCircle: {
    width: scale(26),
    height: scale(26),
    borderRadius: scale(13),
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: { color: '#fff', fontSize: moderateScale(15), flex: 1 },

  planContainer: {
    width: '100%',
    backgroundColor: PLAN_BG,
    borderRadius: scale(16),
    padding: scale(8),
    gap: verticalScale(8),
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    paddingVertical: verticalScale(14),
    paddingHorizontal: scale(14),
    borderRadius: scale(12),
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  planRowSelected: {
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
    backgroundColor: 'transparent',
  },
  radioOuterSelected: {
    borderColor: TEAL,
    backgroundColor: TEAL,
  },
  planLabel: {
    flex: 1,
    color: '#fff',
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
  planLabelSelected: { color: '#fff' },
  planPrice: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: moderateScale(14),
    fontWeight: '700',
  },
  planPriceSelected: { color: '#fff' },

  renewNote: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: moderateScale(12),
    marginTop: verticalScale(12),
    marginBottom: verticalScale(20),
    textAlign: 'center',
  },

  ctaButton: {
    width: '100%',
    backgroundColor: '#6B3FA0',
    borderRadius: scale(28),
    paddingVertical: verticalScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(14),
  },
  ctaText: { color: '#fff', fontSize: moderateScale(17), fontWeight: '700' },

  skipText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: moderateScale(14),
    marginBottom: verticalScale(28),
  },

  footer: {
    flexDirection: 'row',
    gap: scale(20),
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  footerLink: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: moderateScale(13),
  },

  testingHint: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: moderateScale(10),
    textAlign: 'center',
  },
});
