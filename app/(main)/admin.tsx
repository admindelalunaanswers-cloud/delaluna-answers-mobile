import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { db } from '@/firebaseConfig';
import { router } from 'expo-router';

import { useHoroscope } from '@/src/context/horoscope-context';
import { useUser } from '@/src/context/user-context';
import { useTheme } from '@/src/hooks/use-theme';
import { useResponsive } from '@/src/hooks/use-responsive';
import { calculateTransits } from '@/src/services/astroEngine';
import { requestBreakdown } from '@/src/services/natal-chart-breakdown.service';
import { requestHoroscope, getTodayDateId } from '@/src/services/horoscope.service';
import { requestTransitReading, getThisWeekDateId } from '@/src/services/transit-reading.service';
import {
  scheduleBreakdownReadyNotification,
  scheduleHoroscopeReadyNotification,
  scheduleTransitReadyNotification,
} from '@/src/services/notifications.service';

// ─── Known accounts ──────────────────────────────────────────────────────────

const KNOWN_EMAILS = [
  'jeanaicode@gmail.com',
  'jeanairoberts@outlook.com',
  'rockergretch@yahoo.com',
  'debba85@yahoo.com',
  'delaluna.admin@delauna.com',
];

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionStatus = 'idle' | 'loading' | 'success' | 'error';

interface UserAdminState {
  uid: string | null;
  isAdmin: boolean;
  fetched: boolean;
  toggling: boolean;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminScreen() {
  const { authUser, userDoc } = useUser();
  const { chartDetails, transitMoon, transitRetrogrades } = useHoroscope();
  const { theme: { colors: C } } = useTheme();
  const { moderateScale: ms } = useResponsive();
  const insets = useSafeAreaInsets();

  // Notification test statuses
  const [notifHoroscope, setNotifHoroscope] = useState<ActionStatus>('idle');
  const [notifBreakdown, setNotifBreakdown] = useState<ActionStatus>('idle');
  const [notifTransit,   setNotifTransit]   = useState<ActionStatus>('idle');

  // Re-send prompt statuses
  const [resendHoroscope, setResendHoroscope] = useState<ActionStatus>('idle');
  const [resendBreakdown, setResendBreakdown] = useState<ActionStatus>('idle');
  const [resendTransit,   setResendTransit]   = useState<ActionStatus>('idle');

  // Per-user admin state — keyed by email
  const [userAdminStates, setUserAdminStates] = useState<Record<string, UserAdminState>>(
    Object.fromEntries(
      KNOWN_EMAILS.map(email => [email, { uid: null, isAdmin: false, fetched: false, toggling: false }]),
    ),
  );

  // Fetch isAdmin for all known emails on mount
  useEffect(() => {
    KNOWN_EMAILS.forEach(async (email) => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
        if (snap.empty) {
          setUserAdminStates(prev => ({ ...prev, [email]: { ...prev[email], fetched: true } }));
          return;
        }
        const docSnap = snap.docs[0];
        const isAdmin = docSnap.data()?.isAdmin === true;
        setUserAdminStates(prev => ({
          ...prev,
          [email]: { uid: docSnap.id, isAdmin, fetched: true, toggling: false },
        }));
      } catch {
        setUserAdminStates(prev => ({ ...prev, [email]: { ...prev[email], fetched: true } }));
      }
    });
  }, []);

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const run = async (setter: (s: ActionStatus) => void, fn: () => Promise<void>) => {
    setter('loading');
    try {
      await fn();
      setter('success');
      setTimeout(() => setter('idle'), 3000);
    } catch (e) {
      console.error('[AdminScreen]', e);
      setter('error');
      setTimeout(() => setter('idle'), 4000);
    }
  };

  const toggleAdmin = async (email: string) => {
    const current = userAdminStates[email];
    if (!current || current.toggling || !current.uid) return;
    const newValue = !current.isAdmin;
    setUserAdminStates(prev => ({ ...prev, [email]: { ...prev[email], toggling: true } }));
    try {
      await setDoc(doc(db, 'users', current.uid), { isAdmin: newValue }, { merge: true });
      setUserAdminStates(prev => ({
        ...prev,
        [email]: { ...prev[email], isAdmin: newValue, toggling: false },
      }));
    } catch (e) {
      console.error('[AdminScreen] toggleAdmin error', e);
      setUserAdminStates(prev => ({ ...prev, [email]: { ...prev[email], toggling: false } }));
    }
  };

  // ─── Push notification tests ──────────────────────────────────────────────

  const testHoroscopeNotif = () =>
    run(setNotifHoroscope, () => scheduleHoroscopeReadyNotification());

  const testBreakdownNotif = () =>
    run(setNotifBreakdown, () => scheduleBreakdownReadyNotification());

  const testTransitNotif = () =>
    run(setNotifTransit, () => scheduleTransitReadyNotification());

  // ─── Re-send prompts ──────────────────────────────────────────────────────

  const resendHoroscopePrompt = () =>
    run(setResendHoroscope, async () => {
      if (!authUser?.uid || !chartDetails) throw new Error('Missing user or chart data');
      const pronouns    = userDoc?.pronouns ?? 'they/them';
      const moon        = transitMoon ?? chartDetails.moon;
      const retrogrades = transitRetrogrades;
      await requestHoroscope(authUser.uid, getTodayDateId(), chartDetails, moon, retrogrades, pronouns);
    });

  const resendBreakdownPrompt = () =>
    run(setResendBreakdown, async () => {
      if (!authUser?.uid || !chartDetails) throw new Error('Missing user or chart data');
      await requestBreakdown(authUser.uid, chartDetails, userDoc?.pronouns ?? 'they/them');
    });

  const resendTransitPrompt = () =>
    run(setResendTransit, async () => {
      if (!authUser?.uid || !chartDetails) throw new Error('Missing user or chart data');
      const transits = await calculateTransits(new Date(), userDoc?.birthLat ?? 0, userDoc?.birthLon ?? 0);
      await requestTransitReading(authUser.uid, getThisWeekDateId(), chartDetails, transits, userDoc?.pronouns ?? 'they/them');
    });

  // ─── Styles ───────────────────────────────────────────────────────────────

  const styles = StyleSheet.create({
    container:    { flex: 1 },
    content:      { paddingHorizontal: ms(20), paddingTop: ms(8), gap: ms(10) },
    pageTitle:    { color: C.headerText, fontSize: ms(26), fontWeight: '700', marginBottom: ms(4) },
    sectionTitle: {
      color: C.text,
      fontSize: ms(11),
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginTop: ms(12),
      opacity: 0.7,
    },
    hint:     { color: C.text, fontSize: ms(12), opacity: 0.5, marginTop: -ms(4) },
    btn: {
      backgroundColor: C.primary,
      borderRadius: ms(10),
      paddingVertical: ms(14),
      paddingHorizontal: ms(16),
      alignItems: 'center',
    },
    btnSuccess: { backgroundColor: '#4CAF50' },
    btnError:   { backgroundColor: '#F44336' },
    btnText:    { color: C.headerText, fontSize: ms(15), fontWeight: '600' },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: C.overlay,
      borderRadius: ms(10),
      paddingVertical: ms(12),
      paddingHorizontal: ms(14),
    },
    userEmail: { color: C.text, fontSize: ms(13), flex: 1, marginRight: ms(8) },
    userAdminLabel: { color: C.text, fontSize: ms(12), opacity: 0.6, marginRight: ms(8) },
  });

  // ─── Sub-components ───────────────────────────────────────────────────────

  const ActionButton = ({
    label,
    status,
    onPress,
  }: { label: string; status: ActionStatus; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.btn, status === 'success' && styles.btnSuccess, status === 'error' && styles.btnError]}
      onPress={onPress}
      disabled={status === 'loading'}
      activeOpacity={0.75}
    >
      {status === 'loading' ? (
        <ActivityIndicator color={C.headerText} size="small" />
      ) : (
        <Text style={styles.btnText}>
          {status === 'success' ? `${label} — Sent` :
           status === 'error'   ? `${label} — Failed` :
           label}
        </Text>
      )}
    </TouchableOpacity>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + ms(24) }]}
    >
      <Text style={[styles.pageTitle, { marginTop: insets.top + ms(16) }]}>Admin</Text>

      {/* ── Push Notification Tests ── */}
      <Text style={styles.sectionTitle}>Push Notification Tests</Text>
      <ActionButton label="Horoscope Ready"   status={notifHoroscope} onPress={testHoroscopeNotif} />
      <ActionButton label="Birth Chart Ready" status={notifBreakdown} onPress={testBreakdownNotif} />
      <ActionButton label="Transit Ready"     status={notifTransit}   onPress={testTransitNotif}   />

      {/* ── Re-send Prompts ── */}
      <Text style={styles.sectionTitle}>Re-send Prompts</Text>
      <Text style={styles.hint}>
        Overwrites the Firestore doc and re-triggers the Firebase Extension.
      </Text>
      <ActionButton label="Re-send Horoscope"       status={resendHoroscope} onPress={resendHoroscopePrompt} />
      <ActionButton label="Re-send Birth Chart"     status={resendBreakdown} onPress={resendBreakdownPrompt} />
      <ActionButton label="Re-send Transit Reading" status={resendTransit}   onPress={resendTransitPrompt}   />

      {/* ── Prompt Editor ── */}
      <Text style={styles.sectionTitle}>Prompt Templates</Text>
      <ActionButton label="View / Edit Prompts" status="idle" onPress={() => router.push('/(main)/prompt-editor')} />

      {/* ── Test Screens ── */}
      <Text style={styles.sectionTitle}>Test Screens</Text>
      <ActionButton label="Open Test Input Screen"   status="idle" onPress={() => router.push('/(testing)/test-screen')} />
      <ActionButton label="Open Results Screen"      status="idle" onPress={() => router.push('/(testing)/ResultsScreen')} />

      {/* ── User Admin Management ── */}
      <Text style={styles.sectionTitle}>User Admin Access</Text>
      {KNOWN_EMAILS.map((email) => {
        const state = userAdminStates[email];
        return (
          <View key={email} style={styles.userRow}>
            <Text style={styles.userEmail} numberOfLines={1}>{email}</Text>
            {!state?.fetched ? (
              <ActivityIndicator color={C.text} size="small" />
            ) : (
              <>
                <Text style={styles.userAdminLabel}>{state.isAdmin ? 'Admin' : 'User'}</Text>
                <Switch
                  value={state.isAdmin}
                  onValueChange={() => toggleAdmin(email)}
                  disabled={state.toggling || !state.uid}
                  trackColor={{ false: C.inactiveTabs, true: "#5BC0BE" }}
                  thumbColor={C.headerText as string}
                />
              </>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
