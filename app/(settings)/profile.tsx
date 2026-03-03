import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';

import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ThemedView } from '@/src/components/themed-view';
import HeaderNav from '@/src/components/shared/header-nav';
import { useUser } from '@/src/context/user-context';
import { useHoroscope } from '@/src/context/horoscope-context';
import { updateUserDoc } from '@/src/services/user.service';

const NAV_BAR_HEIGHT = 44;

export default function ProfileScreen() {
  const { authUser, userDoc, refresh: refreshUser } = useUser();
  const { refresh: refreshHoroscope } = useHoroscope();
  const [busy, setBusy] = useState(false);

  const insets = useSafeAreaInsets();
  const isPremium = userDoc?.isPremiumMember ?? false;

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

  return (
    <ThemedView style={styles.container}>
      <HeaderNav
        title="Profile"
        leftIconName="chevron-back-outline"
        onLeftPress={() => router.back()}
      />

      <View style={[styles.content, { paddingTop: insets.top + NAV_BAR_HEIGHT + 24 }]}>
        {/* Avatar */}
        <Ionicons name="person-circle-outline" size={80} color="#BCA8F4" />

        {/* Name / email */}
        <Text style={styles.name}>{userDoc?.name ?? '—'}</Text>
        <Text style={styles.email}>{userDoc?.email ?? authUser?.email ?? '—'}</Text>

        {/* Membership badge */}
        <View style={[styles.badge, isPremium ? styles.badgePremium : styles.badgeFree]}>
          <Ionicons
            name={isPremium ? 'sparkles' : 'lock-closed-outline'}
            size={13}
            color={isPremium ? '#FFD700' : '#888'}
          />
          <Text style={[styles.badgeText, isPremium ? styles.badgeTextPremium : styles.badgeTextFree]}>
            {isPremium ? 'PREMIUM MEMBER' : 'FREE PLAN'}
          </Text>
        </View>

        {/* Mock toggle */}
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
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content:   { flex: 1, paddingHorizontal: 24, alignItems: 'center', gap: 8 },

  name:  { color: '#fff',                    fontSize: 20, fontWeight: '700', marginTop: 8 },
  email: { color: 'rgba(255,255,255,0.45)',   fontSize: 13, marginBottom: 8 },

  badge:            { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  badgePremium:     { backgroundColor: 'rgba(255,215,0,0.12)' },
  badgeFree:        { backgroundColor: 'rgba(255,255,255,0.07)' },
  badgeText:        { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  badgeTextPremium: { color: '#FFD700' },
  badgeTextFree:    { color: '#888' },

  button:         { marginTop: 32, borderRadius: 24, paddingVertical: 13, paddingHorizontal: 28, width: '100%', alignItems: 'center' },
  buttonUpgrade:  { backgroundColor: '#8E44AD' },
  buttonDowngrade:{ backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  buttonDisabled: { opacity: 0.5 },
  buttonText:     { color: '#fff', fontSize: 14, fontWeight: '700' },

  hint: { color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', marginTop: 12, paddingHorizontal: 16, lineHeight: 17 },
});
