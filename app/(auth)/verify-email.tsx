import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ThemeContext } from '@/src/context/theme-context';
import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { useUser } from '@/src/context/user-context';
import { useHoroscope } from '@/src/context/horoscope-context';
import { signOut } from '@/src/services/user.service';
import { app, auth } from '@/firebaseConfig';
import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';
import LoadingScreen from '../(util)/loading-screen';

const functions = getFunctions(app, 'us-central1');
const sendVerificationCode = httpsCallable(functions, 'sendVerificationCode');
// const verifyCodeFn = httpsCallable(functions, 'verifyCode'); // TODO: restore once unauthenticated error is resolved

const CODE_LENGTH = 6;

export default function VerifyEmail() {
  const { authUser, reloadAuthUser, refresh } = useUser();
  const { horoscope, transitReadingGenerating, loading: dataLoading, horoscopeGenerating } = useHoroscope();
  const { theme } = useContext(ThemeContext);
  const router = useRouter();

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [reloading, setReloading] = useState(false);

  const horoscopeReady =
    (!!horoscope || (!dataLoading && !horoscopeGenerating)) &&
    !transitReadingGenerating;

  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Auto-send code on mount
  useEffect(() => {
    handleSendCode();
  }, []);

  // Cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const handleSendCode = async () => {
    if (sending || resendCooldown > 0) return;
    if (!auth.currentUser) {
      setSendError('Not signed in. Please sign up or log in first.');
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      await auth.currentUser.getIdToken(true); // ensure a fresh token is attached
      await sendVerificationCode({});
      setCodeSent(true);
      setResendCooldown(60);
    } catch (e: any) {
      const msg: string = e?.message ?? 'Failed to send code.';
      setSendError(msg);
    } finally {
      setSending(false);
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await reloadAuthUser();
      await refresh();
      if (auth.currentUser?.emailVerified) setVerified(true);
    } catch { /* ignore */ } finally {
      setReloading(false);
    }
  };

  const handleSignOut = async () => {
    try { await signOut(); } catch { /* ignore */ }
    router.replace('/(startup)/welcome');
  };

  const handleDigitChange = (text: string, index: number) => {
    const char = text.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);

    if (char && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    // Auto-verify when all digits filled
    if (char && next.every(d => d !== '')) {
      handleVerify(next.join(''));
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (_code?: string) => {
    // TODO: restore code verification once unauthenticated error is resolved
    setVerifying(true);
    try {
      await reloadAuthUser();
      await refresh();
      setVerified(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong.');
    } finally {
      setVerifying(false);
    }
  };

  // Navigate once verified AND AI content is ready
  useEffect(() => {
    if (verified && horoscopeReady) router.replace('/(main)');
  }, [verified, horoscopeReady]);

  if (verifying) return <LoadingScreen message="Verifying..." />;

  // Still waiting for AI generation after verification
  if (verified) {
    return <LoadingScreen progress={horoscope ? 0.6 : 0.1} />;
  }

  const email = authUser?.email ?? '';
  const maskedEmail = email.replace(/(.{2}).+(@.+)/, '$1…$2');

  return (
    <>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ImageBackground
          source={theme.backgroundImage}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />

        <ThemedView style={{ flex: 1 }}>
          <BlurView intensity={90} tint="dark" style={styles.card}>
            <LinearGradient
              colors={['rgba(255,255,255,0.05)', 'rgba(128,128,128,0.05)', 'rgba(0,0,0,0.05)']}
              locations={[0, 0.49, 1]}
              style={StyleSheet.absoluteFillObject}
            >
              {/* Back button */}
              <SafeAreaView style={styles.topBar}>
                <TouchableOpacity onPress={handleSignOut} style={styles.backButton}>
                  <ThemedText style={styles.backText}>← Back</ThemedText>
                </TouchableOpacity>
              </SafeAreaView>

              <ThemedView style={styles.body}>
                {/* Header */}
                <ThemedText style={styles.title}>Verify your email</ThemedText>

                {sendError ? (
                  <ThemedView style={styles.errorBox}>
                    <ThemedText style={styles.errorText}>Could not send code</ThemedText>
                    <ThemedText style={styles.errorDetail}>{sendError}</ThemedText>
                    <TouchableOpacity onPress={handleSendCode} style={styles.retryButton}>
                      <ThemedText style={styles.retryText}>Try again</ThemedText>
                    </TouchableOpacity>
                  </ThemedView>
                ) : (
                  <ThemedText style={styles.subtitle}>
                    {codeSent
                      ? `We sent a 6-digit code to ${maskedEmail}`
                      : sending
                      ? 'Sending code…'
                      : 'Preparing your code…'}
                  </ThemedText>
                )}

                {/* Code input boxes */}
                <View style={styles.codeRow}>
                  {digits.map((d, i) => (
                    <TextInput
                      key={i}
                      ref={el => { inputRefs.current[i] = el; }}
                      style={[styles.digitBox, d ? styles.digitBoxFilled : null]}
                      value={d}
                      onChangeText={text => handleDigitChange(text, i)}
                      onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                      caretHidden
                      textAlign="center"
                      returnKeyType="done"
                    />
                  ))}
                </View>

                {/* Verify button */}
                <TouchableOpacity
                  style={[styles.verifyButton, (verifying || sending) && { opacity: 0.6 }]}
                  onPress={() => handleVerify()}
                  disabled={verifying || sending}
                >
                  <ThemedText style={styles.verifyButtonText}>
                    {verifying ? 'Verifying…' : 'Verify'}
                  </ThemedText>
                </TouchableOpacity>

                {/* Resend */}
                <TouchableOpacity
                  onPress={handleSendCode}
                  disabled={sending || resendCooldown > 0}
                  style={styles.resendButton}
                >
                  <ThemedText style={[styles.resendText, (sending || resendCooldown > 0) && { opacity: 0.45 }]}>
                    {resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : sending
                      ? 'Sending…'
                      : 'Resend code'}
                  </ThemedText>
                </TouchableOpacity>

                {/* Reload */}
                <TouchableOpacity
                  onPress={handleReload}
                  disabled={reloading}
                  style={styles.signOutButton}
                >
                  <ThemedText style={[styles.signOutText, reloading && { opacity: 0.45 }]}>
                    {reloading ? 'Reloading…' : 'Already verified? Reload'}
                  </ThemedText>
                </TouchableOpacity>

                {/* Sign out link */}
                <TouchableOpacity
                  onPress={handleSignOut}
                  style={styles.signOutButton}
                >
                  <ThemedText style={styles.signOutText}>Use a different account</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            </LinearGradient>
          </BlurView>
        </ThemedView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: moderateScale(25),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(10),
  },
  topBar: {
    paddingHorizontal: scale(16),
    paddingTop: Platform.OS === 'android' ? verticalScale(16) : 0,
  },
  backButton: {
    paddingVertical: verticalScale(8),
    alignSelf: 'flex-start',
  },
  backText: {
    color: 'rgba(111,255,233,0.9)',
    fontSize: moderateScale(17),
    fontWeight: '500',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(24),
    gap: scale(12),
  },
  errorBox: {
    width: '100%',
    backgroundColor: 'rgba(255,80,80,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,80,80,0.4)',
    borderRadius: moderateScale(12),
    padding: scale(14),
    alignItems: 'center',
    gap: scale(6),
    marginBottom: verticalScale(8),
  },
  errorText: {
    color: '#ff8080',
    fontWeight: '700',
    fontSize: moderateScale(14),
  },
  errorDetail: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: moderateScale(12),
    textAlign: 'center',
  },
  retryButton: {
    marginTop: verticalScale(4),
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(20),
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: moderateScale(20),
  },
  retryText: {
    color: 'white',
    fontSize: moderateScale(13),
    fontWeight: '600',
  },
  title: {
    fontSize: moderateScale(26),
    fontWeight: '700',
    color: 'white',
    textAlign: 'center',
    marginBottom: verticalScale(4),
  },
  subtitle: {
    fontSize: moderateScale(14),
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: verticalScale(16),
  },
  codeRow: {
    flexDirection: 'row',
    gap: scale(10),
    marginBottom: verticalScale(24),
  },
  digitBox: {
    width: scale(44),
    height: verticalScale(56),
    borderRadius: moderateScale(10),
    borderWidth: 1.5,
    borderColor: 'rgba(167,139,250,0.4)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: 'white',
    fontSize: moderateScale(24),
    fontWeight: '700',
  },
  digitBoxFilled: {
    borderColor: 'rgba(167,139,250,0.9)',
    backgroundColor: 'rgba(167,139,250,0.12)',
  },
  verifyButton: {
    width: '80%',
    backgroundColor: 'rgba(167,139,250,0.5)',
    borderRadius: moderateScale(40),
    paddingVertical: verticalScale(15),
    alignItems: 'center',
  },
  verifyButtonText: {
    color: 'white',
    fontSize: moderateScale(18),
    fontWeight: '600',
  },
  resendButton: {
    paddingVertical: verticalScale(8),
  },
  resendText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: moderateScale(14),
    textDecorationLine: 'underline',
  },
  signOutButton: {
    marginTop: verticalScale(8),
  },
  signOutText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: moderateScale(13),
  },
});
