import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  ImageBackground,
  Keyboard,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { db } from '@/firebaseConfig';
import ChatFlow, { StepConfig } from '@/src/components/sign-up/chat-flow';
import { ThemedView } from '@/src/components/themed-view';
import { themes } from '@/src/context/theme-context';
import { useScreenPerfLog } from '@/src/hooks/use-screen-perf-log';
import { Events } from '@/src/services/analytics.service';
import { BirthData, calculateNatalChart, calculateTransits } from '@/src/services/astroEngine';
import { getTodayDateId, requestHoroscope } from '@/src/services/horoscope.service';
import { requestBreakdown } from '@/src/services/natal-chart-breakdown.service';
import { getThisWeekDateId, requestTransitReading } from '@/src/services/transit-reading.service';
import { createUserDoc, signUp } from '@/src/services/user.service';
import { FinalSignupPayload } from '@/src/types/signup.types';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';
import { moderateScale, scale, verticalScale } from '@/src/utils/responsive';
import { Ionicons } from '@expo/vector-icons';
import LoadingScreen from '../(util)/loading-screen';

// ─── Fallback coordinates (Greenwich) ─────────────────────────────────────────

const FALLBACK_LAT = 0;
const FALLBACK_LON = 0;

// ─── Firebase auth error → user-friendly message ──────────────────────────────

function parseAuthError(err: any): string {
  const code: string = err?.code ?? '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'That email is already registered. Try signing in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/operation-not-allowed':
      return 'Email sign-up is currently disabled. Please contact support.';
    default:
      return err?.message ?? 'Could not create account. Please try again.';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SignUpChatScreen() {
  const router = useRouter();
  const theme = themes.default;
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Setting up your account...');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  const { markReady } = useScreenPerfLog('/(auth)/sign-up');

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const modalCardWidth = width > 640 ? '55%' : width > 480 ? '70%' : '86%';

  // Mark screen ready on mount — form renders immediately, no async data needed
  useEffect(() => {
    markReady();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Timeout safety net
  useEffect(() => {
    if (!isSigningUp) return;
    const timeout = setTimeout(() => {
      Alert.alert(
        'Loading Issue',
        'Your account was created but some data is taking longer than expected. You can continue and verify your email.',
        [{
          text: 'Continue',
          onPress: () => {
            setIsSigningUp(false);
            setIsLoading(false);
            router.replace('/(main)');
          },
        }]
      );
    }, 30000);
    return () => clearTimeout(timeout);
  }, [isSigningUp]);

  const normalizeBirthday = (value: any): string => {
    const raw = String(value ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return raw;
  };

  const handleComplete = async (answers: Record<string, any>) => {
    setIsSigningUp(true);
    setIsLoading(true);
    setLoadingMessage('Creating your account...');

    try {
      const { firstName, lastName, email, password } = answers;
      const trimmedEmail = String(email ?? '').trim();
      const displayName = [firstName, lastName].filter(Boolean).join(' ');

      // Step 1 — Create Auth user
      let userCred;
      try {
        userCred = await signUp(trimmedEmail, password);
      } catch (err: any) {
        setIsLoading(false);
        setIsSigningUp(false);
        if (err?.code === 'auth/email-already-in-use') {
          // Navigate back to email step — ChatFlow stays mounted so answers are preserved
          const emailStepIdx = steps.findIndex(s => s.key === 'email');
          if (emailStepIdx >= 0) setStep(emailStepIdx);
          Alert.alert(
            'Email Already Registered',
            'That email is already in use. Please enter a different address or sign in.',
          );
        } else {
          Alert.alert('Sign Up Failed', parseAuthError(err));
        }
        return;
      }

      Events.signUp('email');

      // Step 2 — Update display name
      setLoadingMessage('Setting up your profile...');
      await updateProfile(userCred.user, { displayName });

      // Step 3 — Create Firestore user document
      const payload: FinalSignupPayload = {
        email: trimmedEmail,
        name: displayName,
        fullName: displayName,
        birthday: normalizeBirthday(answers.birthday),
        birthtime: answers.birthtime ?? null,
        birthTimezone: typeof answers.birthTimezone === 'number' ? answers.birthTimezone : 0,
        birthLat: answers.birthLat ?? FALLBACK_LAT,
        birthLon: answers.birthLon ?? FALLBACK_LON,
        placeOfBirth: answers.placeOfBirth ?? null,
        isBirthTimeUnknown: answers.isBirthTimeUnknown ?? !answers.birthtime,
        isPlaceOfBirthUnknown: answers.isPlaceOfBirthUnknown ?? !answers.placeOfBirth,
        themeKey: 'default',
        profileImageId: 'profile8',
        ...(() => { const { password: _pw, ...rest } = answers; return rest; })(),
      };

      await createUserDoc(userCred.user.uid, payload);

      // Step 4 — Calculate natal chart (same as Calculate Chart in test screen)
      setLoadingMessage('Calculating your birth chart...');
      const [year, month, day] = normalizeBirthday(answers.birthday).split('-').map(Number);
      const [hour, minute] = payload.birthtime
        ? payload.birthtime.split(':').map(Number)
        : [12, 0];
      const bd: BirthData = {
        year, month, day, hour, minute,
        lat: payload.birthLat,
        lon: payload.birthLon,
        timezone: payload.birthTimezone,
      };
      const natalChart = await calculateNatalChart(bd);
      Events.birthChartGenerated({ has_time: !payload.isBirthTimeUnknown });
      const chartPlanets = natalChart.planets.map(({ name, symbol, longitude, sign, signSymbol, degree, minutes, seconds, speed, isRetrograde, house }) =>
        ({ name, symbol, longitude, sign, signSymbol, degree, minutes, seconds, speed, isRetrograde, house })
      );
      const chartPayload = {
        createdAt: serverTimestamp(),
        planets: chartPlanets,
        houses: natalChart.houses,
        moon: natalChart.moon,
        ascendant: natalChart.ascendant,
        midheaven: natalChart.midheaven,
      };

      await setDoc(doc(db, 'users', userCred.user.uid, 'birthChart', 'data'), chartPayload);

      // Step 5 — Trigger AI generation (fire and forget — backend extension handles these)
      const chartDetailsDoc: NatalChartDetailsDoc = {
        createdAt: null as any,
        planets: chartPlanets,
        houses: natalChart.houses,
        moon: natalChart.moon,
        ascendant: natalChart.ascendant,
        midheaven: natalChart.midheaven,
      };
      const uid = userCred.user.uid;
      const dateId     = getTodayDateId();
      const weekDateId = getThisWeekDateId();

      calculateTransits(new Date(), bd.lat, bd.lon)
        .then(transits => {
          const RETROGRADE_PLANETS = new Set(['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']);
          const retrogrades = transits.planets.filter(p => p.isRetrograde && RETROGRADE_PLANETS.has(p.name)).map(p => p.name);
          requestTransitReading(uid, weekDateId, chartDetailsDoc, transits).catch(console.error);
          return requestHoroscope(uid, dateId, chartDetailsDoc, transits.moon, retrogrades);
        })
        .catch(() => requestHoroscope(uid, dateId, chartDetailsDoc, natalChart.moon))
        .then(() => requestBreakdown(uid, chartDetailsDoc))
        .catch(console.error);

      // Navigate to email verification — user enters code while AI generation runs in background.
      setIsLoading(false);
      setIsSigningUp(false);
      router.replace('/(auth)/verify-email');

    } catch (err: any) {
      Alert.alert('Sign Up Error', parseAuthError(err));
      setIsLoading(false);
      setIsSigningUp(false);
    }
  };

  const onCancelPress = () => {
    if (step > 0) setConfirmVisible(true);
    else router.replace('/(startup)/welcome');
  };

  const confirmCancel = () => {
    setConfirmVisible(false);
    router.replace('/(startup)/welcome');
  };

  const steps: StepConfig[] = [
    { key: 'firstName',    inputType: 'text',     placeholder: 'First name…' },
    { key: 'lastName',     inputType: 'text',     placeholder: 'Last name…' },
    { key: 'pronouns',     inputType: 'choices',  choices: ['She/Her', 'He/Him', 'They/Them', 'Non Binary'] },
    { key: 'birthday',     inputType: 'date' },
    { key: 'birthtime',    inputType: 'time' },
    { key: 'placeOfBirth', inputType: 'location', placeholder: 'Search city…' },
    { key: 'email',        inputType: 'email',    placeholder: 'Email address…' },
    { key: 'password',     inputType: 'secure',   placeholder: 'Password…' },
    { key: 'final',        inputType: 'final',
    },
  ];

  return (
    <ImageBackground source={theme.backgroundImage} style={styles.background} resizeMode="cover">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ThemedView style={{ flex: 1 }}>
          <StatusBar style="light" translucent />

          <BlurView intensity={10} tint="dark" style={[styles.overlay, Platform.OS === 'android' && { paddingTop: insets.top + verticalScale(12) }]}>
            <ThemedView
              style={styles.header}
              onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
            >

               <ThemedView style={{ flexDirection: 'row', alignItems: 'center' }}>
                { step > 0 && (<TouchableOpacity onPress={() => {
                Keyboard.dismiss();
                if (step === 0) router.replace('/(startup)/welcome');
                else setStep(step - 1);
              }}>

                <ThemedView style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="arrow-back" size={moderateScale(20)} color="#6FFFE9" />
                <Text style={styles.goBackText}> Go Back</Text>
                </ThemedView>
                
              </TouchableOpacity>)}
               </ThemedView>

                <ThemedView style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={onCancelPress}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
                </ThemedView>
      
              
            </ThemedView>

            <ThemedView style={styles.chatFlowWrapper}>
              <ChatFlow
                steps={steps}
                onComplete={handleComplete}
                step={step}
                setStep={setStep}
                keyboardOffset={headerHeight}
              />
            </ThemedView>
          </BlurView>

          {/* Loading overlay — keeps ChatFlow mounted so answers are preserved */}
          {isLoading && (
            <ThemedView style={StyleSheet.absoluteFillObject}>
              <LoadingScreen message={loadingMessage || undefined} />
            </ThemedView>
          )}

        </ThemedView>
      </TouchableWithoutFeedback>

      {/* Discard confirmation modal */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={[styles.modalCard, { width: modalCardWidth }]}>
            <Text style={styles.modalTitle}>Discard signup?</Text>
            <Text style={styles.modalBody}>Your answers will be lost. You can start again anytime.</Text>
            <ThemedView style={styles.modalActions}>
              <TouchableOpacity onPress={() => setConfirmVisible(false)} style={[styles.modalBtn, styles.btnGhost]}>
                <Text style={styles.btnGhostText}>Keep editing</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmCancel} style={[styles.modalBtn, styles.btnDanger]}>
                <Text style={styles.btnDangerText}>Discard & Exit</Text>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  overlay: {
    flex: 1,
    paddingTop: verticalScale(Platform.OS === 'ios' ? 60 : 40),
    paddingHorizontal: scale(4),
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    marginBottom: verticalScale(8),
  },
  goBackText: { 
    color: '#6FFFE9', fontSize: moderateScale(20), fontWeight: '500', textAlign: 'center', },
  cancelText: { color: '#6FFFE9', fontSize: moderateScale(18), fontWeight: '500' },
  chatFlowWrapper: { flex: 1, width: '100%' },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(12),
  },
  modalCard: {
    borderRadius: scale(14),
    paddingVertical: verticalScale(16),
    paddingHorizontal: scale(16),
    backgroundColor: 'rgba(20,20,24,0.92)',
    maxWidth: scale(500),
  },
  modalTitle: { color: '#fff', fontSize: moderateScale(18), fontWeight: '700', marginBottom: verticalScale(6), textAlign: 'center' },
  modalBody: { color: '#cfd3dc', fontSize: moderateScale(14), textAlign: 'center', marginBottom: verticalScale(16) },
  modalActions: { flexDirection: 'row', gap: scale(12), justifyContent: 'center' },
  modalBtn: { paddingVertical: verticalScale(10), paddingHorizontal: scale(14), borderRadius: scale(10), minWidth: scale(140), alignItems: 'center' },
  btnGhost: { backgroundColor: 'rgba(255,255,255,0.08)' },
  btnGhostText: { color: '#e6e9f0', fontWeight: '600' },
  btnDanger: { backgroundColor: '#ff4d4f' },
  btnDangerText: { color: '#fff', fontWeight: '700' },
});
