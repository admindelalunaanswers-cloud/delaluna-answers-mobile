import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ImageBackground,
  Platform,
  Modal,
  useWindowDimensions,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

import { ThemeContext } from '@/src/context/theme-context';
import { useUser } from '@/src/context/user-context';
import { signUp, createUserDoc } from '@/src/services/user.service';
import { FinalSignupPayload } from '@/src/types/signup.types';
import { calculateNatalChart, calculateTransits, BirthData } from '@/src/services/astroEngine';
import { requestBreakdown } from '@/src/services/natal-chart-breakdown.service';
import { requestHoroscope, getTodayDateId } from '@/src/services/horoscope.service';
import { requestTransitReading } from '@/src/services/transit-reading.service';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';
import { db } from '@/firebaseConfig';
import { verticalScale, scale, moderateScale } from '@/src/utils/responsive';
import ChatFlow, { StepConfig } from '@/src/components/sign-up/chat-flow';
import LoadingScreen from '../(util)/loading-screen';

// ─── Fallback coordinates (Greenwich) ─────────────────────────────────────────

const FALLBACK_LAT = 51.4779;
const FALLBACK_LON = 0.0015;

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

// ─── Admin accounts for quick dev testing ─────────────────────────────────────

const ADMIN_ACCOUNTS = [
  { firstName: 'Delaluna', lastName: 'Answers', email: 'delalunaanswers@gmail.com', password: 'Password' },
  { firstName: 'Jeanai', lastName: 'Dev', email: 'jeanaicode@gmail.com', password: 'Password' },
];

const generateRandomAdultBirthday = (): string => {
  const age = Math.floor(Math.random() * 63) + 18;
  const year = new Date().getFullYear() - age;
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const generateRandomBirthTime = (): string => {
  const h = String(Math.floor(Math.random() * 24)).padStart(2, '0');
  const m = String(Math.floor(Math.random() * 60)).padStart(2, '0');
  return `${h}:${m}`;
};

const generateRandomLocation = () => {
  const locations = [
    { label: 'New York, NY, USA', lat: 40.7128, lon: -74.0060, tz: -5 },
    { label: 'Los Angeles, CA, USA', lat: 34.0522, lon: -118.2437, tz: -8 },
    { label: 'Chicago, IL, USA', lat: 41.8781, lon: -87.6298, tz: -6 },
    { label: 'Miami, FL, USA', lat: 25.7617, lon: -80.1918, tz: -5 },
  ];
  return locations[Math.floor(Math.random() * locations.length)];
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SignUpChatScreen() {
  const router = useRouter();
  const { theme } = useContext(ThemeContext);
  const { authUser, loading: userLoading } = useUser();

  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Setting up your account...');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [showAdminButtons, setShowAdminButtons] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  const { width } = useWindowDimensions();
  const modalCardWidth = width > 640 ? '55%' : width > 480 ? '70%' : '86%';

  // Navigate once auth state is ready after signup
  useEffect(() => {
    if (isSigningUp && !userLoading && authUser) {
      setLoadingMessage('Welcome to your cosmic journey!');
      setTimeout(() => {
        setIsSigningUp(false);
        setIsLoading(false);
        router.replace('/(main)');
      }, 500);
    }
  }, [isSigningUp, userLoading, authUser]);

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
        Alert.alert('Sign Up Failed', parseAuthError(err));
        setIsLoading(false);
        setIsSigningUp(false);
        return;
      }

      // Step 2 — Update display name
      setLoadingMessage('Setting up your profile...');
      await updateProfile(userCred.user, { displayName });

      // Step 3 — Create Firestore user document
      const payload: FinalSignupPayload = {
        email: trimmedEmail,
        name: displayName,
        birthday: normalizeBirthday(answers.birthday),
        birthtime: answers.birthtime ?? null,
        birthTimezone: typeof answers.birthTimezone === 'number' ? answers.birthTimezone : 0,
        birthLat: answers.birthLat ?? FALLBACK_LAT,
        birthLon: answers.birthLon ?? FALLBACK_LON,
        placeOfBirth: answers.placeOfBirth ?? null,
        isBirthTimeUnknown: answers.isBirthTimeUnknown ?? !answers.birthtime,
        isPlaceOfBirthUnknown: answers.isPlaceOfBirthUnknown ?? !answers.placeOfBirth,
        themeKey: 'default',
        ...answers,
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

      await setDoc(doc(db, 'users', userCred.user.uid, 'natalChart', 'details'), chartPayload);
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
      const dateId = getTodayDateId();

      requestBreakdown(uid, chartDetailsDoc, 'free').catch(console.error);

      calculateTransits(new Date(), bd.lat, bd.lon)
        .then(transits => {
          const retrogrades = transits.planets.filter(p => p.isRetrograde).map(p => p.name);
          requestTransitReading(uid, dateId, chartDetailsDoc, transits, 'free').catch(console.error);
          return requestHoroscope(uid, dateId, chartDetailsDoc, transits.moon, retrogrades);
        })
        .catch(() => requestHoroscope(uid, dateId, chartDetailsDoc, natalChart.moon))
        .catch(console.error);

      setLoadingMessage('Welcome to your cosmic journey!');
      // Navigation handled by the useEffect watching authUser

    } catch (err: any) {
      Alert.alert('Sign Up Error', parseAuthError(err));
      setIsLoading(false);
      setIsSigningUp(false);
    }
  };

  const createAdminAccount = async (index: number) => {
    if (isLoading) return;
    try {
      const account = ADMIN_ACCOUNTS[index];
      const location = generateRandomLocation();
      const pronouns = ['She/Her', 'He/Him', 'They/Them', 'Non-Binary'][Math.floor(Math.random() * 4)];

      setShowAdminButtons(false);
      await handleComplete({
        firstName: account.firstName,
        lastName: account.lastName,
        email: account.email,
        password: account.password,
        pronouns,
        birthday: generateRandomAdultBirthday(),
        birthtime: generateRandomBirthTime(),
        birthTimezone: location.tz,
        placeOfBirth: location.label,
        birthLat: location.lat,
        birthLon: location.lon,
        isBirthTimeUnknown: false,
        isPlaceOfBirthUnknown: false,
      });
    } catch {
      Alert.alert('Error', 'Failed to create admin account');
      setShowAdminButtons(true);
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

  if (isLoading) {
    return <LoadingScreen message={loadingMessage} />;
  }

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
        <View style={{ flex: 1 }}>
          <StatusBar style="light" translucent backgroundColor="transparent" />

          <BlurView intensity={10} tint="dark" style={styles.overlay}>
            <View
              style={styles.header}
              onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
            >
              <TouchableOpacity onPress={() => {
                Keyboard.dismiss();
                if (step === 0) router.replace('/(startup)/welcome');
                else setStep(step - 1);
              }}>
                <Text style={styles.goBackText}>← Go Back</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onCancelPress}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.chatFlowWrapper}>
              <ChatFlow
                steps={steps}
                onComplete={handleComplete}
                step={step}
                setStep={setStep}
                keyboardOffset={headerHeight}
              />
            </View>
          </BlurView>

          {/* Dev shortcuts — tap top-right corner to reveal */}
          {step === 0 && (
            <>
              {!showAdminButtons && (
                <TouchableOpacity
                  style={styles.tapArea}
                  onPress={() => setShowAdminButtons(true)}
                  activeOpacity={1}
                />
              )}
              {showAdminButtons && (
                <View style={styles.devButtonContainer}>
                  <TouchableOpacity style={styles.devButton} onPress={() => createAdminAccount(0)} disabled={isLoading}>
                    <Text style={styles.devButtonText}>Admin: Delaluna</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.devButton} onPress={() => createAdminAccount(1)} disabled={isLoading}>
                    <Text style={styles.devButtonText}>DEV: Jeanai</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.devButton, styles.closeButton]} onPress={() => setShowAdminButtons(false)}>
                    <Text style={styles.devButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </TouchableWithoutFeedback>

      {/* Discard confirmation modal */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { width: modalCardWidth }]}>
            <Text style={styles.modalTitle}>Discard signup?</Text>
            <Text style={styles.modalBody}>Your answers will be lost. You can start again anytime.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setConfirmVisible(false)} style={[styles.modalBtn, styles.btnGhost]}>
                <Text style={styles.btnGhostText}>Keep editing</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmCancel} style={[styles.modalBtn, styles.btnDanger]}>
                <Text style={styles.btnDangerText}>Discard & Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  goBackText: { color: '#6FFFE9', fontSize: moderateScale(18), fontWeight: '500' },
  cancelText: { color: '#6FFFE9', fontSize: moderateScale(18), fontWeight: '500' },
  chatFlowWrapper: { flex: 1, width: '100%' },
  tapArea: { position: 'absolute', top: 0, right: 0, width: scale(100), height: verticalScale(100), zIndex: 998 },
  devButtonContainer: {
    position: 'absolute',
    top: verticalScale(Platform.OS === 'ios' ? 100 : 80),
    right: scale(16),
    flexDirection: 'column',
    gap: scale(8),
    zIndex: 999,
  },
  devButton: {
    backgroundColor: 'rgba(111,255,233,0.15)',
    borderWidth: 1,
    borderColor: '#6FFFE9',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
    borderRadius: scale(6),
  },
  closeButton: { alignItems: 'center' },
  devButtonText: { color: '#6FFFE9', fontSize: scale(12), fontWeight: '600' },
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
