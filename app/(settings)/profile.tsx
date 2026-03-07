import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';

import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { deleteUser } from 'firebase/auth';

import { ThemedView } from '@/src/components/themed-view';
import HeaderNav from '@/src/components/shared/header-nav';
import { useUser } from '@/src/context/user-context';
import { useHoroscope } from '@/src/context/horoscope-context';
import { updateUserDoc, signOut } from '@/src/services/user.service';
import { auth } from '@/firebaseConfig';
import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';

const NAV_BAR_HEIGHT = 44;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDateDisplay(value: any): string {
  if (!value) return '';
  let dateId = '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    dateId = value;
  } else if (typeof value === 'object' && typeof value.toDate === 'function') {
    const d = value.toDate() as Date;
    dateId = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (!dateId) return String(value);
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

export default function ProfileScreen() {
  const { authUser, userDoc, refresh: refreshUser } = useUser();
  const { refresh: refreshHoroscope } = useHoroscope();
  const [busy, setBusy] = useState(false);

  const insets = useSafeAreaInsets();
  const ud = userDoc as any;
  const isPremium = ud?.isPremiumMember ?? false;

  const isBirthTimeUnknown  = ud?.isBirthTimeUnknown ?? !ud?.birthtime;
  const isPlaceOfBirthUnknown = ud?.isPlaceOfBirthUnknown ?? !ud?.placeOfBirth;
  const placeOfBirth = ud?.placeOfBirth ?? ud?.birthplace ?? null;
  const birthtime    = ud?.birthtime ?? ud?.birthTime ?? '';

  const togglePremium = async () => {
    if (!authUser?.uid) return;
    setBusy(true);
    try {
      await updateUserDoc(authUser.uid, { isPremiumMember: !isPremium });
      await refreshUser();
      await refreshHoroscope();
    } catch {
      Alert.alert('Error', 'Could not update membership status.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } catch {
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
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const user = auth.currentUser;
              if (!user) return;
              await deleteUser(user);
            } catch (err: any) {
              if (err?.code === 'auth/requires-recent-login') {
                Alert.alert(
                  'Re-authentication required',
                  'For security, please log out and log back in before deleting your account.',
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

  return (
    <ThemedView style={styles.container}>
      <HeaderNav
        title="Profile"
        leftIconName="chevron-back-outline"
        onLeftPress={() => router.back()}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + scale(NAV_BAR_HEIGHT) + scale(24) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <Ionicons name="person-circle-outline" size={scale(80)} color="#BCA8F4" />

        {/* Name / email */}
        <Text style={styles.name}>{ud?.name ?? '—'}</Text>
        <Text style={styles.email}>{ud?.email ?? authUser?.email ?? '—'}</Text>

        {/* Membership badge */}
        <View style={[styles.badge, isPremium ? styles.badgePremium : styles.badgeFree]}>
          <Ionicons
            name={isPremium ? 'sparkles' : 'lock-closed-outline'}
            size={scale(13)}
            color={isPremium ? '#FFD700' : '#888'}
          />
          <Text style={[styles.badgeText, isPremium ? styles.badgeTextPremium : styles.badgeTextFree]}>
            {isPremium ? 'PREMIUM MEMBER' : 'FREE PLAN'}
          </Text>
        </View>

        {/* Edit profile button */}
        <TouchableOpacity
          style={[styles.editButton, styles.editButtonDisabled]}
          disabled
          activeOpacity={1}
        >
          <Ionicons name="pencil-outline" size={scale(15)} color="rgba(111,255,233,0.3)" />
          <Text style={[styles.editButtonText, styles.editButtonTextDisabled]}>Edit Profile</Text>
        </TouchableOpacity>

        {/* ── Account info ── */}
        <View style={styles.detailsCard}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>First name</Text>
            <Text style={styles.detailValue}>{ud?.firstName ?? '—'}</Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Last name</Text>
            <Text style={styles.detailValue}>{ud?.lastName ?? '—'}</Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Email</Text>
            <Text style={styles.detailValue} numberOfLines={1}>
              {ud?.email ?? authUser?.email ?? '—'}
            </Text>
          </View>
        </View>

        {/* ── Birth details ── */}
        <View style={[styles.detailsCard, { marginTop: 12 }]}>
          <View style={styles.sectionLabelRow}>
            <Text style={[styles.sectionLabel, { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }]}>BIRTH DETAILS</Text>
            {(() => {
              const used = ud?.birthDetailsChangeCount ?? 0;
              const remaining = Math.max(0, 3 - used);
              return (
                <Text style={[styles.changesRemaining, remaining === 0 && styles.changesRemainingNone]}>
                  {remaining === 0 ? 'No changes left' : `${remaining} ${remaining === 1 ? 'change' : 'changes'} left`}
                </Text>
              );
            })()}
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Birthday</Text>
            <Text style={styles.detailValue}>
              {ud?.birthday ? formatDateDisplay(ud.birthday) : '—'}
            </Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Birth time</Text>
            <Text style={[styles.detailValue, isBirthTimeUnknown && styles.detailValueMuted]}>
              {isBirthTimeUnknown ? "I don't know" : (birthtime ? formatTimeDisplay(birthtime) : '—')}
            </Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Birth place</Text>
            <Text style={[styles.detailValue, isPlaceOfBirthUnknown && styles.detailValueMuted]}>
              {isPlaceOfBirthUnknown ? "I don't know" : (placeOfBirth ?? '—')}
            </Text>
          </View>

          {ud?.pronouns ? (
            <>
              <View style={styles.separator} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Pronouns</Text>
                <Text style={styles.detailValue}>{ud.pronouns}</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Mock premium toggle */}
        <TouchableOpacity
          style={[
            styles.button,
            isPremium ? styles.buttonDowngrade : styles.buttonUpgrade,
            busy && styles.buttonDisabled,
          ]}
          onPress={togglePremium}
          disabled={busy}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {busy
              ? 'Updating...'
              : isPremium
                ? 'Deactivate Premium (Test)'
                : 'Activate Premium (Test)'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          After toggling, pull to refresh on content screens to load the updated tier.
        </Text>

        {/* ── Account actions ── */}
        <View style={styles.accountActions}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={scale(18)} color="#fff" />
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeleteAccount}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={scale(16)} color="#ff4d4f" />
            <Text style={styles.deleteText}>Delete account</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: verticalScale(32) }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { flex: 1 },
  content:   { paddingHorizontal: scale(24), alignItems: 'center', gap: scale(8) },

  name:  { color: '#fff',                    fontSize: moderateScale(20), fontWeight: '700', marginTop: verticalScale(8) },
  email: { color: 'rgba(255,255,255,0.45)',   fontSize: moderateScale(13), marginBottom: verticalScale(8) },

  badge:            { flexDirection: 'row', alignItems: 'center', gap: scale(6), borderRadius: scale(20), paddingHorizontal: scale(14), paddingVertical: verticalScale(6) },
  badgePremium:     { backgroundColor: 'rgba(255,215,0,0.12)' },
  badgeFree:        { backgroundColor: 'rgba(255,255,255,0.07)' },
  badgeText:        { fontSize: moderateScale(11), fontWeight: '800', letterSpacing: 1.2 },
  badgeTextPremium: { color: '#FFD700' },
  badgeTextFree:    { color: '#888' },

  editButton:             { flexDirection: 'row', alignItems: 'center', gap: scale(6), marginTop: verticalScale(8), paddingHorizontal: scale(16), paddingVertical: verticalScale(8), borderRadius: scale(20), borderWidth: 1, borderColor: 'rgba(111,255,233,0.4)', backgroundColor: 'rgba(111,255,233,0.08)' },
  editButtonDisabled:     { borderColor: 'rgba(111,255,233,0.15)', backgroundColor: 'rgba(111,255,233,0.03)', opacity: 0.5 },
  editButtonText:         { color: '#6FFFE9', fontSize: moderateScale(13), fontWeight: '600' },
  editButtonTextDisabled: { color: 'rgba(111,255,233,0.4)' },

  // Details card
  detailsCard:  { width: '100%', marginTop: verticalScale(20), borderRadius: scale(16), backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  sectionLabel: { color: 'rgba(255,255,255,0.4)', fontSize: moderateScale(11), fontWeight: '700', letterSpacing: 1.2, paddingHorizontal: scale(16), paddingTop: verticalScale(14), paddingBottom: verticalScale(10) },
  detailRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: scale(16), paddingVertical: verticalScale(13) },
  detailLabel:  { color: 'rgba(255,255,255,0.55)', fontSize: moderateScale(14) },
  detailValue:  { color: '#fff', fontSize: moderateScale(14), fontWeight: '500', flexShrink: 1, textAlign: 'right', marginLeft: scale(16) },
  detailValueMuted: { color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', fontWeight: '400' },
  separator:    { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: scale(16) },

  sectionLabelRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: scale(16), paddingTop: verticalScale(14), paddingBottom: verticalScale(10) },
  changesRemaining:     { color: 'rgba(111,255,233,0.6)', fontSize: moderateScale(11), fontWeight: '600' },
  changesRemainingNone: { color: 'rgba(255,77,79,0.8)' },

  button:         { marginTop: verticalScale(24), borderRadius: scale(24), paddingVertical: verticalScale(13), paddingHorizontal: scale(28), width: '100%', alignItems: 'center' },
  buttonUpgrade:  { backgroundColor: '#8E44AD' },
  buttonDowngrade:{ backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  buttonDisabled: { opacity: 0.5 },
  buttonText:     { color: '#fff', fontSize: moderateScale(14), fontWeight: '700' },

  hint: { color: 'rgba(255,255,255,0.3)', fontSize: moderateScale(11), textAlign: 'center', marginTop: verticalScale(8), paddingHorizontal: scale(16), lineHeight: moderateScale(17) },

  // Account actions
  accountActions: { width: '100%', marginTop: verticalScale(32), gap: scale(12) },
  logoutButton:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8), borderRadius: scale(14), paddingVertical: verticalScale(14), backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  logoutText:     { color: '#fff', fontSize: moderateScale(15), fontWeight: '600' },
  deleteButton:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8), borderRadius: scale(14), paddingVertical: verticalScale(13) },
  deleteText:     { color: '#ff4d4f', fontSize: moderateScale(14), fontWeight: '500' },
});
