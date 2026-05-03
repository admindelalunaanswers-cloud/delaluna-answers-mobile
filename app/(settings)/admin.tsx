/**
 * Admin / Dev controls screen.
 *
 * Lets a privileged user toggle plan state (free / freeTrial / premium)
 * and override runtime limits (daily chat, free/premium connection caps).
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';

import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ThemedView } from '@/src/components/themed-view';
import HeaderNav from '@/src/components/shared/header-nav';
import { useRevenueCat } from '@/src/context/revenuecat-context';
import {
  useAdmin,
  DEFAULT_DAILY_CHAT_LIMIT,
  DEFAULT_FREE_CONNECTION_LIMIT,
  DEFAULT_PREMIUM_CONNECTION_LIMIT,
} from '@/src/context/admin-context';
import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';

const NAV_BAR_HEIGHT = 44;

// ─── Stepper row ──────────────────────────────────────────────────────────────

function Stepper({
  label,
  value,
  defaultValue,
  onChange,
  step = 1,
  min = 0,
  max = 999,
}: {
  label: string;
  value: number;
  defaultValue: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const isOverridden = value !== defaultValue;
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));

  return (
    <View style={ss.stepperRow}>
      <View style={ss.stepperLabelCol}>
        <Text style={ss.detailLabel}>{label}</Text>
        <Text style={ss.stepperHint}>
          Default: {defaultValue}
          {isOverridden ? '  •  overridden' : ''}
        </Text>
      </View>

      <View style={ss.stepperControls}>
        <TouchableOpacity
          style={[ss.stepBtn, value <= min && ss.stepBtnDisabled]}
          onPress={dec}
          disabled={value <= min}
          activeOpacity={0.7}
        >
          <Ionicons name="remove" size={scale(18)} color="#6FFFE9" />
        </TouchableOpacity>

        <Text style={ss.stepperValue}>{value}</Text>

        <TouchableOpacity
          style={[ss.stepBtn, value >= max && ss.stepBtnDisabled]}
          onPress={inc}
          disabled={value >= max}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={scale(18)} color="#6FFFE9" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const { devPlan, setDevPlan, isPro } = useRevenueCat();
  const {
    dailyChatLimit,
    freeConnectionLimit,
    premiumConnectionLimit,
    setDailyChatLimit,
    setFreeConnectionLimit,
    setPremiumConnectionLimit,
    resetToDefaults,
  } = useAdmin();

  const planLabel =
    devPlan === 'premium' ? 'Premium' : devPlan === 'freeTrial' ? 'Free Trial' : 'Free';

  const handleReset = () => {
    Alert.alert(
      'Reset overrides',
      'Restore all limits to their default values?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: resetToDefaults },
      ],
    );
  };

  return (
    <ThemedView style={ss.container}>
      <HeaderNav
        title="Admin"
        leftIconName="chevron-back-outline"
        onLeftPress={() => router.back()}
      />

      <ScrollView
        style={[ss.scroll, { marginTop: insets.top + scale(NAV_BAR_HEIGHT) }]}
        contentContainerStyle={[ss.content, { paddingTop: scale(24) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Plan toggles ── */}
        <View style={ss.detailsCard}>
          <Text style={ss.sectionLabel}>PLAN</Text>

          <View style={ss.detailRow}>
            <Text style={ss.detailLabel}>Free trial</Text>
            <Switch
              value={devPlan === 'freeTrial'}
              onValueChange={(on) => setDevPlan(on ? 'freeTrial' : 'free')}
              trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(111,255,233,0.5)' }}
              thumbColor={devPlan === 'freeTrial' ? '#6FFFE9' : '#f4f3f4'}
            />
          </View>
          <View style={ss.separator} />
          <View style={[ss.detailRow, devPlan === 'freeTrial' && ss.rowDisabled]}>
            <Text style={ss.detailLabel}>Premium</Text>
            <Switch
              value={devPlan === 'premium'}
              onValueChange={(on) => setDevPlan(on ? 'premium' : 'free')}
              disabled={devPlan === 'freeTrial'}
              trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(255,215,0,0.5)' }}
              thumbColor={devPlan === 'premium' ? '#FFD700' : '#f4f3f4'}
            />
          </View>
          <View style={ss.separator} />
          <View style={ss.detailRow}>
            <Text style={ss.detailLabel}>Current plan</Text>
            <Text style={ss.detailValue}>{planLabel}</Text>
          </View>
          <View style={ss.separator} />
          <View style={ss.detailRow}>
            <Text style={ss.detailLabel}>isPro</Text>
            <Text style={ss.detailValue}>{isPro ? 'true' : 'false'}</Text>
          </View>
        </View>

        {/* ── Limit overrides ── */}
        <View style={[ss.detailsCard, { marginTop: scale(12) }]}>
          <Text style={ss.sectionLabel}>LIMIT OVERRIDES</Text>

          <Stepper
            label="Daily chat questions"
            value={dailyChatLimit}
            defaultValue={DEFAULT_DAILY_CHAT_LIMIT}
            onChange={setDailyChatLimit}
            max={50}
          />
          <View style={ss.separator} />
          <Stepper
            label="Free connection limit"
            value={freeConnectionLimit}
            defaultValue={DEFAULT_FREE_CONNECTION_LIMIT}
            onChange={setFreeConnectionLimit}
            max={50}
          />
          <View style={ss.separator} />
          <Stepper
            label="Premium connection limit"
            value={premiumConnectionLimit}
            defaultValue={DEFAULT_PREMIUM_CONNECTION_LIMIT}
            onChange={setPremiumConnectionLimit}
            max={100}
          />
        </View>

        <TouchableOpacity style={ss.resetButton} onPress={handleReset} activeOpacity={0.8}>
          <Ionicons name="refresh-outline" size={scale(15)} color="#ff9c9e" />
          <Text style={ss.resetButtonText}>Reset to defaults</Text>
        </TouchableOpacity>

        <Text style={ss.footnote}>
          Overrides are stored locally on this device and do not affect other users.
        </Text>

        <View style={{ height: verticalScale(32) }} />
      </ScrollView>
    </ThemedView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { flex: 1 },
  content:   { paddingHorizontal: scale(24), gap: scale(8) },

  detailsCard: {
    width: '100%',
    borderRadius: scale(16),
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: moderateScale(11),
    fontWeight: '700',
    letterSpacing: 1.2,
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(14),
    paddingBottom: verticalScale(10),
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(13),
  },
  detailLabel: { color: 'rgba(255,255,255,0.85)', fontSize: moderateScale(14) },
  detailValue: {
    color: '#fff',
    fontSize: moderateScale(14),
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: scale(16),
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: scale(16),
  },
  rowDisabled: { opacity: 0.4 },

  // Stepper
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
  },
  stepperLabelCol: { flex: 1, paddingRight: scale(12) },
  stepperHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: moderateScale(11),
    marginTop: verticalScale(2),
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  stepBtn: {
    width: scale(30),
    height: scale(30),
    borderRadius: scale(15),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(111,255,233,0.4)',
    backgroundColor: 'rgba(111,255,233,0.08)',
  },
  stepBtnDisabled: { opacity: 0.35 },
  stepperValue: {
    minWidth: scale(28),
    textAlign: 'center',
    color: '#fff',
    fontSize: moderateScale(16),
    fontWeight: '700',
  },

  // Reset
  resetButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    marginTop: verticalScale(16),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    borderRadius: scale(20),
    borderWidth: 1,
    borderColor: 'rgba(255,156,158,0.35)',
    backgroundColor: 'rgba(255,156,158,0.08)',
  },
  resetButtonText: { color: '#ff9c9e', fontSize: moderateScale(13), fontWeight: '600' },

  footnote: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: moderateScale(11),
    textAlign: 'center',
    marginTop: verticalScale(10),
    paddingHorizontal: scale(16),
  },
});
