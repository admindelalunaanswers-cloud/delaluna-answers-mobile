import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { updateEmail } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { app, auth } from '@/firebaseConfig';
import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { useHoroscope } from '@/src/context/horoscope-context';
import { ThemeContext } from '@/src/context/theme-context';
import { useUser } from '@/src/context/user-context';
import { signOut, updateUserDoc } from '@/src/services/user.service';
import { Events } from '@/src/services/analytics.service';
import { moderateScale, scale, verticalScale } from '@/src/utils/responsive';
import LoadingScreen from '../(util)/loading-screen';

const functions = getFunctions(app, 'us-central1');
const sendVerificationCode = httpsCallable(functions, 'sendVerificationCode');
const verifyCodeFn = httpsCallable(functions, 'verifyCode');

const CODE_LENGTH = 6;

export default function VerifyEmail() {
  const { authUser, reloadAuthUser, refresh } = useUser();
  const { horoscope, loading: dataLoading, horoscopeGenerating } = useHoroscope();
  const { theme } = useContext(ThemeContext);
  const router = useRouter();

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);

  // Don't gate on transitReadingGenerating — transit reading populates the
  // transits screen separately and can lag well behind today's horoscope.
  const horoscopeReady =
    !!horoscope || (!dataLoading && !horoscopeGenerating);

  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Auto-send code on mount
  useEffect(() => {
    handleSendCode();
  }, []);

  // Cooldown countdown — setTimeout so each tick schedules exactly one next tick
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
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

  const handleSignOut = async () => {
    try { await signOut(); } catch { /* ignore */ }
    router.replace('/(startup)/welcome');
  };

  const handleSaveEmail = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setEmailChangeError('Enter a valid email address.');
      return;
    }
    if (!auth.currentUser) return;
    setSavingEmail(true);
    setEmailChangeError(null);
    try {
      await updateEmail(auth.currentUser, trimmed);
      await updateUserDoc(auth.currentUser.uid, { email: trimmed });
      await reloadAuthUser();
      setEditingEmail(false);
      // Resend code to the new address
      setCodeSent(false);
      setResendCooldown(0);
      await handleSendCode();
    } catch (e: any) {
      setEmailChangeError(e?.message ?? 'Could not update email.');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleDigitChange = (text: string, index: number) => {
    if (verifyError) setVerifyError(null);
    // Strip anything that isn't a letter or digit, uppercase, take the last
    // character. Lets users paste the whole code (handled below via length>1).
    const cleaned = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    // Paste of full code: distribute across boxes starting at this index.
    if (cleaned.length > 1) {
      const next = [...digits];
      for (let i = 0; i < CODE_LENGTH - index && i < cleaned.length; i++) {
        next[index + i] = cleaned[i];
      }
      setDigits(next);
      const lastFilled = Math.min(index + cleaned.length, CODE_LENGTH) - 1;
      inputRefs.current[Math.min(lastFilled + 1, CODE_LENGTH - 1)]?.focus();
      if (next.every(d => d !== '')) handleVerify(next.join(''));
      return;
    }

    const char = cleaned.slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);

    if (char && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    if (char && next.every(d => d !== '')) {
      handleVerify(next.join(''));
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (code?: string) => {
    if (verifying) return;

    const enteredCode = code ?? digits.join('');

    if (!enteredCode || enteredCode.length !== CODE_LENGTH) {
      setVerifyError('Please enter all 6 characters of the code.');
      return;
    }

    setVerifyError(null);
    setVerifying(true);
    try {
      await verifyCodeFn({ code: enteredCode });
      Events.emailVerified();
    } catch (e: any) {
      const msg = e?.message ?? 'Something went wrong.';
      setVerifyError(msg);
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      setVerifying(false);
      return;
    }

    // Verification succeeded — reload auth state but don't let failures
    // undo the successful verification (the OTP doc is already deleted).
    try {
      await reloadAuthUser();
      await refresh();
    } catch {
      // Post-verification refresh failed; navigation will still proceed.
    }

    setVerified(true);
    setVerifying(false);
  };

  // Navigate once verified AND AI content is ready
  useEffect(() => {
    if (verified && horoscopeReady) router.replace('/(main)');
  }, [verified, horoscopeReady]);

  // Safety net: if the horoscope is still generating 30s after verification,
  // navigate anyway — the main app can render with partial data and the
  // subscriptions will fill in the rest as docs arrive.
  useEffect(() => {
    if (!verified) return;
    const timeout = setTimeout(() => router.replace('/(main)'), 30000);
    return () => clearTimeout(timeout);
  }, [verified]);

  if (verifying) return <LoadingScreen message="Verifying..." />;

  // Still waiting for AI generation after verification
  if (verified) {
    return <LoadingScreen progress={horoscope ? 0.6 : 0.1} />;
  }

  const email = authUser?.email ?? '';

  return (
    <>
      <StatusBar style="light" translucent />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                  </ThemedView>
                ) : editingEmail ? (
                  <ThemedView style={styles.emailEditContainer}>
                    <TextInput
                      style={styles.emailInput}
                      value={newEmail}
                      onChangeText={t => { setNewEmail(t); setEmailChangeError(null); }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      placeholder="Enter new email"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                    />
                    {emailChangeError && (
                      <ThemedText style={styles.emailChangeError}>{emailChangeError}</ThemedText>
                    )}
                    <View style={styles.emailEditActions}>
                      <TouchableOpacity
                        onPress={() => { setEditingEmail(false); setEmailChangeError(null); }}
                        style={styles.emailCancelButton}
                        disabled={savingEmail}
                      >
                        <ThemedText style={styles.emailCancelText}>Cancel</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleSaveEmail}
                        style={[styles.emailSaveButton, savingEmail && { opacity: 0.6 }]}
                        disabled={savingEmail}
                      >
                        <ThemedText style={styles.emailSaveText}>
                          {savingEmail ? 'Saving…' : 'Save'}
                        </ThemedText>
                      </TouchableOpacity>
                    </View>
                  </ThemedView>
                ) : (
                  <ThemedView style={styles.emailRow}>
                    <ThemedText style={styles.subtitle}>
                      {codeSent
                        ? `Code sent to`
                        : sending
                        ? 'Sending code…'
                        : 'Preparing your code…'}
                    </ThemedText>
                    {codeSent && (
                      <>
                        <ThemedText style={styles.emailDisplay}>{email}</ThemedText>
                        <TouchableOpacity
                          onPress={() => { setNewEmail(email); setEditingEmail(true); }}
                        >
                          <ThemedText style={styles.changeEmailText}>Change email</ThemedText>
                        </TouchableOpacity>
                      </>
                    )}
                  </ThemedView>
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
                      keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'default'}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={6}
                      selectTextOnFocus
                      caretHidden
                      textAlign="center"
                    />
                  ))}
                </View>

                {/* Inline verification error */}
                {verifyError && (
                  <ThemedText style={styles.verifyError}>{verifyError}</ThemedText>
                )}

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
  verifyError: {
    color: '#ff8080',
    fontSize: moderateScale(13),
    textAlign: 'center',
  },
  emailRow: {
    alignItems: 'center',
    gap: scale(4),
    marginBottom: verticalScale(8),
  },
  emailDisplay: {
    color: 'white',
    fontSize: moderateScale(14),
    fontWeight: '600',
    textAlign: 'center',
  },
  changeEmailText: {
    color: 'rgba(111,255,233,0.9)',
    fontSize: moderateScale(13),
    textDecorationLine: 'underline',
    marginTop: verticalScale(2),
  },
  emailEditContainer: {
    width: '100%',
    gap: scale(8),
    marginBottom: verticalScale(8),
  },
  emailInput: {
    width: '100%',
    height: verticalScale(48),
    borderRadius: moderateScale(10),
    borderWidth: 1.5,
    borderColor: 'rgba(111,255,233,0.4)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: 'white',
    fontSize: moderateScale(14),
    paddingHorizontal: scale(14),
  },
  emailChangeError: {
    color: '#ff8080',
    fontSize: moderateScale(12),
    textAlign: 'center',
  },
  emailEditActions: {
    flexDirection: 'row',
    gap: scale(10),
    justifyContent: 'center',
  },
  emailCancelButton: {
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(20),
    borderRadius: moderateScale(20),
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  emailCancelText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: moderateScale(14),
    fontWeight: '500',
  },
  emailSaveButton: {
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(24),
    borderRadius: moderateScale(20),
    backgroundColor: 'rgba(111,255,233,0.18)',
  },
  emailSaveText: {
    color: 'rgba(111,255,233,0.95)',
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
});
