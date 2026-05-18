import React, { useEffect, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator, Linking,
} from 'react-native';

const PRIVACY_POLICY_URL = 'https://admindelalunaanswers-cloud.github.io/delaluna-legal/';
const TERMS_OF_USE_URL   = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { deleteUser } from 'firebase/auth';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { ThemedView } from '@/src/components/themed-view';
import HeaderNav from '@/src/components/shared/header-nav';
import { useUser } from '@/src/context/user-context';
import { useHoroscope } from '@/src/context/horoscope-context';
import { useRevenueCat } from '@/src/context/revenuecat-context';
import { useFreeTrialAccess } from '@/src/hooks/use-free-trial-access';
import { signOut } from '@/src/services/user.service';
import { registerForPushNotifications, unregisterPushToken } from '@/src/services/notifications.service';
import { getProfileImageSource } from '@/app/(settings)/select-avatar';
import { auth } from '@/firebaseConfig';
import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function normalizeBirthday(value: any): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const d = value.toDate() as Date;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return String(value);
}

function formatDateDisplay(value: any): string {
  const dateId = normalizeBirthday(value);
  if (!dateId || !/^\d{4}-\d{2}-\d{2}$/.test(dateId)) return String(value ?? '');
  const [y, m, d] = dateId.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function formatTimeDisplay(time: string): string {
  if (!time) return '';
  const [h, min] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(min).padStart(2, '0')} ${period}`;
}

// ─── Component ─────────────────────────────────────────────────────────────────

const NAV_BAR_HEIGHT = 44;

export default function ProfileScreen() {
  const { authUser, userDoc, loading: userLoading } = useUser();
  const {} = useHoroscope();
  const {
    isPro,
    setDevPlan,
  } = useRevenueCat();
  const { inTrial } = useFreeTrialAccess();
  const insets = useSafeAreaInsets();
  const ud = userDoc as any;

  const [busy] = useState(false);
  const [notifPermission, setNotifPermission] = useState<string | null>(null);
  const [enablingNotifs, setEnablingNotifs] = useState(false);

  const isPremium = isPro;
  const profileImageSource = getProfileImageSource(ud?.profileImageId) ?? getProfileImageSource('profile8')!;

  // Check notification permission on mount
  useEffect(() => {
    if (!Device.isDevice) return;
    Notifications.getPermissionsAsync().then(({ status }) => setNotifPermission(status));
  }, []);

  const handleEnableNotifications = async () => {
    if (!authUser?.uid) return;
    setEnablingNotifs(true);
    try {
      await registerForPushNotifications(authUser.uid);
      const { status } = await Notifications.getPermissionsAsync();
      setNotifPermission(status);
      if (status !== 'granted') {
        Alert.alert('Notifications blocked', 'Please enable notifications in your device settings.');
      }
    } finally {
      setEnablingNotifs(false);
    }
  };

  // ── Subscription actions ────────���──────────────────────────────────────────────

  const handleUpgrade = () => {
    router.push('/(settings)/paywall');
  };

  const handleManageSubscription = () => {
    router.push('/(settings)/paywall');
  };

  const handleRestore = () => {
    setDevPlan('premium');
    Alert.alert('Restored', 'Premium access restored.');
  };

  // ── Log out / delete ──────────────────────────────────────────────────────────

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out', style: 'destructive',
        onPress: async () => {
          try {
            // Remove the push token *before* signOut — Firestore writes
            // require an authenticated user, and we want to stop this device
            // from receiving notifications meant for the logged-out account.
            if (authUser?.uid) {
              await unregisterPushToken(authUser.uid);
            }
            await signOut();
            router.replace('/(startup)/welcome');
          } catch (err) {
            console.error('[profile] logout failed:', err);
            Alert.alert('Error', 'Could not log out. Please try again.');
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const user = auth.currentUser;
            if (!user) return;
            try {
              // The `delete-user-data` extension watches Auth deletes and
              // cleans up Firestore docs, push tokens, and storage on its own.
              await deleteUser(user);
              router.replace('/(startup)/welcome');
            } catch (err: any) {
              console.error('[profile] delete failed:', err);
              if (err?.code === 'auth/requires-recent-login') {
                Alert.alert(
                  'Re-authentication required',
                  'For your security, please log out and log back in before deleting your account.',
                );
              } else {
                Alert.alert('Error', 'Could not delete account. Please try again.');
              }
            }
          },
        },
      ]
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────────

  // Avoid rendering empty "—" placeholders while the user doc is still being
  // fetched from Firestore (context sets `userDoc` to `undefined` until the
  // first `getDoc` resolves).
  const isUserDocLoading = userLoading || userDoc === undefined;

  if (isUserDocLoading) {
    return (
      <ThemedView style={ss.container}>
        <HeaderNav
          title="Profile"
          leftIconName="chevron-back-outline"
          onLeftPress={() => router.back()}
        />
        <View style={[ss.loadingContainer, { paddingTop: insets.top + scale(NAV_BAR_HEIGHT) }]}>
          <ActivityIndicator size="large" color="#6FFFE9" />
        </View>
      </ThemedView>
    );
  }

  

  return (
    <ThemedView style={ss.container}>
      <HeaderNav
        title="Profile"
        leftIconName="chevron-back-outline"
        onLeftPress={() => router.back()}
      />

      <ScrollView
        style={[ss.scroll, { marginTop: insets.top + scale(NAV_BAR_HEIGHT) }]}
        contentContainerStyle={[ss.content, { paddingTop: scale(24) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Avatar ── */}
        <View style={ss.avatarContainer}>
          <View style={ss.avatarRing}>
            <Image source={profileImageSource} style={ss.avatarImage} />
          </View>
          <TouchableOpacity
            style={ss.pencilBadge}
            onPress={() => router.push('/(settings)/select-avatar')}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil" size={scale(22)} color="#6FFFE9" />
          </TouchableOpacity>
        </View>

        {/* ── Name / email / badge ── */}
        <Text style={ss.name}>{ud?.name ?? '—'}</Text>
        <Text style={ss.email}>{ud?.email ?? authUser?.email ?? '—'}</Text>

        <View style={[ss.badge, isPremium ? ss.badgePremium : inTrial ? ss.badgeTrial : ss.badgeFree]}>
          <Ionicons
            name={isPremium ? 'sparkles' : inTrial ? 'time-outline' : 'lock-closed-outline'}
            size={scale(13)}
            color={isPremium ? '#FFD700' : inTrial ? '#6FFFE9' : '#888'}
          />
          <Text style={[ss.badgeText, isPremium ? ss.badgeTextPremium : inTrial ? ss.badgeTextTrial : ss.badgeTextFree]}>
            {isPremium ? 'PREMIUM MEMBER' : inTrial ? 'PREMIUM TRIAL' : 'FREE MEMBER'}
          </Text>
        </View>

        {/* ── Action buttons ── */}
        <View style={ss.actionRow}>
          <TouchableOpacity
            style={ss.actionButton}
            onPress={() => router.push('/(settings)/edit-profile')}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil-outline" size={scale(15)} color="#6FFFE9" />
            <Text style={ss.actionButtonText}>Edit Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={ss.actionButton}
            onPress={() => router.push('/(settings)/update-theme.screen')}
            activeOpacity={0.8}
          >
            <Ionicons name="color-palette-outline" size={scale(15)} color="#6FFFE9" />
            <Text style={ss.actionButtonText}>Change Theme</Text>
          </TouchableOpacity>
        </View>

        {/* ── Account info card ── */}
        <View style={ss.detailsCard}>
          <Text style={ss.sectionLabel}>ACCOUNT</Text>

          <View style={ss.detailRow}>
            <Text style={ss.detailLabel}>First name</Text>
            <Text style={ss.detailValue}>{ud?.firstName ?? '—'}</Text>
          </View>
          <View style={ss.separator} />
          <View style={ss.detailRow}>
            <Text style={ss.detailLabel}>Last name</Text>
            <Text style={ss.detailValue}>{ud?.lastName ?? '—'}</Text>
          </View>
          <View style={ss.separator} />
          <View style={ss.detailRow}>
            <Text style={ss.detailLabel}>Pronouns</Text>
            <Text style={[ss.detailValue, !ud?.pronouns && ss.detailValueMuted]}>
              {ud?.pronouns ?? '—'}
            </Text>
          </View>
          <View style={ss.separator} />
          <View style={ss.detailRow}>
            <Text style={ss.detailLabel}>Email</Text>
            <Text style={ss.detailValue} numberOfLines={1}>
              {ud?.email ?? authUser?.email ?? '—'}
            </Text>
          </View> 
          <View style={ss.separator} />
         
          <TouchableOpacity
            onPress={() => router.push('/(settings)/purchased-reports')}>
             <View style={ss.detailRow}>
              <Text style={ss.detailLabel}>Reports purchased</Text>
              <Text style={ss.detailValue}>{ud?.purchasedReports ?? '-'}</Text>
            </View>
          </TouchableOpacity>
                 
        </View>

        {/* ── Birth details card ── */}
        <View style={[ss.detailsCard, { marginTop: scale(12) }]}>
          <View style={ss.sectionLabelRow}>
            <Text style={ss.sectionLabelInner}>BIRTH DETAILS</Text>
            {(() => {
              const remaining = Math.max(0, 3 - (ud?.birthDetailsChangeCount ?? 0));
              return (
                <Text style={[ss.changesRemaining, remaining === 0 && ss.changesRemainingNone]}>
                  {remaining === 0 ? 'No changes left' : `${remaining} ${remaining === 1 ? 'change' : 'changes'} left`}
                </Text>
              );
            })()}
          </View>

          <View style={ss.detailRow}>
            <Text style={ss.detailLabel}>Birthday</Text>
            <Text style={ss.detailValue}>
              {ud?.birthday ? formatDateDisplay(ud.birthday) : '—'}
            </Text>
          </View>
          <View style={ss.separator} />
          <View style={ss.detailRow}>
            <Text style={ss.detailLabel}>Birth time</Text>
            <Text style={[ss.detailValue, ud?.isBirthTimeUnknown && ss.detailValueMuted]}>
              {ud?.isBirthTimeUnknown ? "I don't know" : (ud?.birthtime ? formatTimeDisplay(ud.birthtime) : '—')}
            </Text>
          </View>
          <View style={ss.separator} />
          <View style={ss.detailRow}>
            <Text style={ss.detailLabel}>Birth place</Text>
            <Text style={[ss.detailValue, ud?.isPlaceOfBirthUnknown && ss.detailValueMuted]}>
              {ud?.isPlaceOfBirthUnknown ? "I don't know" : (ud?.placeOfBirth ?? '—')}
            </Text>
          </View>
        </View>

        {/* ── Enable notifications (shown only when permission not granted) ── */}
        {Device.isDevice && notifPermission !== 'granted' && (
          <TouchableOpacity
            style={[ss.notifButton, enablingNotifs && ss.buttonDisabled]}
            onPress={handleEnableNotifications}
            disabled={enablingNotifs}
            activeOpacity={0.8}
          >
            <Ionicons name="notifications-outline" size={scale(16)} color="#BCA8F4" />
            <Text style={ss.notifButtonText}>
              {enablingNotifs ? 'Enabling…' : 'Enable Notifications'}
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Settings rows: reset password, log out, delete ── */}
        <View style={ss.settingsCard}>
          {ud?.isAdmin && (
            <>
              <TouchableOpacity
                style={ss.settingsRow}
                onPress={() => router.push('/(settings)/admin')}
                activeOpacity={0.75}
              >
                <Ionicons name="construct-outline" size={scale(18)} color="#6FFFE9" style={{ marginRight: scale(4) }} />
                <Text style={ss.rowText}>Admin</Text>
                <Image source={require('@/src/assets/actions/arrow-right-icon.png')} style={ss.rowArrow} />
              </TouchableOpacity>
              <View style={ss.rowDivider} />
            </>
          )}

          <TouchableOpacity
            style={ss.settingsRow}
            onPress={() => router.push('/(settings)/update-password')}
            activeOpacity={0.75}
          >
            <Text style={ss.rowText}>Reset Password</Text>
            <Image source={require('@/src/assets/actions/arrow-right-icon.png')} style={ss.rowArrow} />
          </TouchableOpacity>

          <View style={ss.rowDivider} />

           <TouchableOpacity style={ss.settingsRow} onPress={() => router.push('/(util)/support')} activeOpacity={0.75}>
            <Ionicons name="help-circle-outline" size={scale(18)} color="#ffffff" style={{ marginRight: scale(4) }} />
            <Text style={ss.rowText}>Support</Text>
            <Image source={require('@/src/assets/actions/arrow-right-icon.png')} style={ss.rowArrow} />
          </TouchableOpacity>

          <View style={ss.rowDivider} />

           <TouchableOpacity style={ss.settingsRow} onPress={() => router.push('/(util)/feedback')} activeOpacity={0.75}>
            <Ionicons name="chatbubble-ellipses-outline" size={scale(18)} color="#ffffff" style={{ marginRight: scale(4) }} />
            <Text style={ss.rowText}>Feedback</Text>
            <Image source={require('@/src/assets/actions/arrow-right-icon.png')} style={ss.rowArrow} />
          </TouchableOpacity>

          <View style={ss.rowDivider} />


          <TouchableOpacity style={ss.settingsRow} onPress={handleLogout} activeOpacity={0.75}>
           <Ionicons name="log-out-outline" size={scale(18)} color="#efefef" style={{ marginRight: scale(4) }} />
            <Text style={ss.rowText}>Log out</Text>
            <Image source={require('@/src/assets/actions/arrow-right-icon.png')} style={ss.rowArrow} />
          </TouchableOpacity>

          <View style={ss.rowDivider} />

          <TouchableOpacity style={ss.settingsRow} onPress={() => Linking.openURL(TERMS_OF_USE_URL)} activeOpacity={0.75}>
            <Ionicons name="document-text-outline" size={scale(18)} color="#ffffff" style={{ marginRight: scale(4) }} />
            <Text style={ss.rowText}>Terms of Use</Text>
            <Image source={require('@/src/assets/actions/arrow-right-icon.png')} style={ss.rowArrow} />
          </TouchableOpacity>

          <View style={ss.rowDivider} />

          <TouchableOpacity style={ss.settingsRow} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)} activeOpacity={0.75}>
            <Ionicons name="shield-checkmark-outline" size={scale(18)} color="#ffffff" style={{ marginRight: scale(4) }} />
            <Text style={ss.rowText}>Privacy Policy</Text>
            <Image source={require('@/src/assets/actions/arrow-right-icon.png')} style={ss.rowArrow} />
          </TouchableOpacity>

          <View style={ss.rowDivider} />

          <TouchableOpacity style={ss.settingsRow} onPress={handleDeleteAccount} activeOpacity={0.75}>
            <Image source={require('@/src/assets/actions/delete-account-icon.png')} style={[ss.rowIcon, ss.rowIconDanger]} />
            <Text style={ss.rowTextDanger}>Delete account</Text>
            <Image source={require('@/src/assets/actions/arrow-right-icon.png')} style={[ss.rowArrow, ss.rowIconDanger]} />
          </TouchableOpacity>

          
        </View>

        {/* ── Subscription actions ── */}
        {isPremium ? (
          <TouchableOpacity
            style={[ss.button, ss.buttonDowngrade, busy && ss.buttonDisabled]}
            onPress={handleManageSubscription}
            disabled={busy}
            activeOpacity={0.8}
          >
            <Text style={ss.buttonText}>
              {busy ? 'Loading...' : 'Manage Subscription'}
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[ss.button, ss.buttonUpgrade, busy && ss.buttonDisabled]}
              onPress={handleUpgrade}
              disabled={busy}
              activeOpacity={0.8}
            >
              <Text style={ss.buttonText}>
                {busy ? 'Loading...' : 'Upgrade to Premium'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[ss.restoreButton, busy && ss.buttonDisabled]}
              onPress={handleRestore}
              disabled={busy}
              activeOpacity={0.8}
            >
              <Text style={ss.restoreButtonText}>Restore Purchases</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: verticalScale(32) }} />
      </ScrollView>
    </ThemedView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { flex: 1 },
  content:   { paddingHorizontal: scale(24), alignItems: 'center', gap: scale(8) },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Avatar
  avatarContainer: { position: 'relative', marginBottom: verticalScale(4) },
  avatarRing: {
    width: scale(96),
    height: scale(96),
    borderRadius: scale(48),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  pencilBadge: {
    position: 'absolute',
    bottom: scale(-2),
    right: scale(-2),
    padding: scale(4),
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Name / email / badge
  name:             { color: '#fff', fontSize: moderateScale(20), fontWeight: '700', marginTop: verticalScale(8) },
  email:            { color: 'rgba(255,255,255,0.45)', fontSize: moderateScale(13), marginBottom: verticalScale(4) },
  badge:            { flexDirection: 'row', alignItems: 'center', gap: scale(6), borderRadius: scale(20), paddingHorizontal: scale(14), paddingVertical: verticalScale(6) },
  badgePremium:     { backgroundColor: 'rgba(255,215,0,0.12)' },
  badgeTrial:       { backgroundColor: 'rgba(111,255,233,0.12)' },
  badgeFree:        { backgroundColor: 'rgba(255,255,255,0.07)' },
  badgeText:        { fontSize: moderateScale(11), fontWeight: '800', letterSpacing: 1.2 },
  badgeTextPremium: { color: '#FFD700' },
  badgeTextTrial:   { color: '#6FFFE9' },
  badgeTextFree:    { color: '#888' },

  // Action row
  actionRow:        { flexDirection: 'row', gap: scale(8), marginTop: verticalScale(8) },
  actionButton:     { flexDirection: 'row', alignItems: 'center', gap: scale(6), paddingHorizontal: scale(14), paddingVertical: verticalScale(8), borderRadius: scale(20), borderWidth: 1, borderColor: 'rgba(111,255,233,0.4)', backgroundColor: 'rgba(111,255,233,0.08)' },
  actionButtonText: { color: '#6FFFE9', fontSize: moderateScale(13), fontWeight: '600' },

  // Detail cards
  detailsCard:          { width: '100%', marginTop: verticalScale(16), borderRadius: scale(16), backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  sectionLabel:         { color: 'rgba(255,255,255,0.4)', fontSize: moderateScale(11), fontWeight: '700', letterSpacing: 1.2, paddingHorizontal: scale(16), paddingTop: verticalScale(14), paddingBottom: verticalScale(10) },
  sectionLabelRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: scale(16), paddingTop: verticalScale(14), paddingBottom: verticalScale(10) },
  sectionLabelInner:    { color: 'rgba(255,255,255,0.4)', fontSize: moderateScale(11), fontWeight: '700', letterSpacing: 1.2 },
  detailRow:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: scale(16), paddingVertical: verticalScale(13) },
  detailLabel:          { color: 'rgba(255,255,255,0.55)', fontSize: moderateScale(14) },
  detailValue:          { color: '#fff', fontSize: moderateScale(14), fontWeight: '500', flexShrink: 1, textAlign: 'right', marginLeft: scale(16) },
  detailValueMuted:     { color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', fontWeight: '400' },
  separator:            { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: scale(16) },
  changesRemaining:     { color: 'rgba(111,255,233,0.6)', fontSize: moderateScale(11), fontWeight: '600' },
  changesRemainingNone: { color: 'rgba(255,77,79,0.8)' },

  // Notifications
  notifButton:     { flexDirection: 'row', alignItems: 'center', gap: scale(8), marginTop: verticalScale(4), paddingVertical: verticalScale(10), paddingHorizontal: scale(16), borderRadius: scale(20), borderWidth: 1, borderColor: 'rgba(188,168,244,0.4)', backgroundColor: 'rgba(188,168,244,0.08)' },
  notifButtonText: { color: '#BCA8F4', fontSize: moderateScale(14), fontWeight: '600' },

  // Premium toggle
  button:          { width: '80%', borderRadius: scale(20), paddingVertical: verticalScale(12), alignItems: 'center', marginTop: verticalScale(16) },
  buttonUpgrade:   { backgroundColor: 'rgba(111,255,233,0.15)', borderWidth: 1, borderColor: 'rgba(111,255,233,0.4)' },
  buttonDowngrade: { backgroundColor: 'rgba(255,100,100,0.12)', borderWidth: 1, borderColor: 'rgba(255,100,100,0.35)' },
  buttonDisabled:  { opacity: 0.5 },
  buttonText:      { color: '#fff', fontSize: moderateScale(14), fontWeight: '600' },
  restoreButton:     { marginTop: verticalScale(8) },
  restoreButtonText: { color: 'rgba(255,255,255,0.45)', fontSize: moderateScale(13), textAlign: 'center', textDecorationLine: 'underline' },
  hint:              { color: 'rgba(255,255,255,0.3)', fontSize: moderateScale(11), textAlign: 'center', marginTop: verticalScale(6) },

  // Settings rows
  settingsCard:    { width: '100%', marginTop: verticalScale(20), borderRadius: scale(16), backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  settingsRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: scale(16), paddingVertical: verticalScale(14), gap: scale(12) },
  rowIcon:         { width: scale(22), height: scale(22), resizeMode: 'contain', tintColor: 'rgba(255,255,255,0.7)' },
  rowText:         { flex: 1, color: '#fff', fontSize: moderateScale(15), fontWeight: '500' },
  rowArrow:        { width: scale(16), height: scale(16), resizeMode: 'contain', tintColor: 'rgba(255,255,255,0.3)' },
  rowDivider:      { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: scale(16) },
  rowIconDanger:   { tintColor: '#ff4d4f' },
  rowTextDanger:   { flex: 1, color: '#ff4d4f', fontSize: moderateScale(15), fontWeight: '500' },
  rowDisabled:     { opacity: 0.4 },

  // Consumables
});
