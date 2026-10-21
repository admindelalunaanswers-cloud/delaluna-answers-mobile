import React, { useContext, useEffect, useRef, useState } from "react";
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { getFunctions, httpsCallable } from "firebase/functions";

import { app, auth } from "@/firebaseConfig";
import { ThemedText } from "@/src/components/themed-text";
import { ThemedView } from "@/src/components/themed-view";
import { useHoroscope } from "@/src/context/horoscope-context";
import { ThemeContext } from "@/src/context/theme-context";
import { useUser } from "@/src/context/user-context";
import { useAnnounce } from "@/src/hooks/use-announce";
import { useScreenPerfLog } from "@/src/hooks/use-screen-perf-log";
import { Events } from "@/src/services/analytics.service";
import { signOut } from "@/src/services/user.service";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";
import LoadingScreen from "../(util)/loading-screen";

const functions = getFunctions(app, "us-central1");
const sendVerificationCode = httpsCallable(functions, "sendVerificationCode");
const verifyCodeFn = httpsCallable(functions, "verifyCode");

const CODE_LENGTH = 6;
const MIN_TARGET = 44;

export default function VerifyEmail() {
  const { authUser, reloadAuthUser, refresh } = useUser();
  const {
    horoscope,
    loading: dataLoading,
    horoscopeGenerating,
  } = useHoroscope();
  const { theme } = useContext(ThemeContext);
  const router = useRouter();

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  useAnnounce(sendError ? `Could not send code. ${sendError}` : null);
  useAnnounce(verifyError);
  // Passes through null while sending, so each resend announces again.
  useAnnounce(!sending && codeSent ? "Verification code sent to your email." : null);
  useAnnounce(verified ? "Email verified. Preparing your reading." : null);
  // Auto-submit leaves focus on a code box, so the button's "Verifying…" is never read.
  useAnnounce(verifying ? "Verifying code" : null);

  // Don't gate on transitReadingGenerating — transit reading populates the
  // transits screen separately and can lag well behind today's horoscope.
  const horoscopeReady = !!horoscope || (!dataLoading && !horoscopeGenerating);

  const { markReady } = useScreenPerfLog("/(auth)/verify-email");

  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Mark screen ready on mount — OTP form renders immediately
  useEffect(() => {
    markReady();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cooldown countdown — setTimeout so each tick schedules exactly one next tick
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(
      () => setResendCooldown((c) => Math.max(0, c - 1)),
      1000,
    );
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleSendCode = async () => {
    if (sending || resendCooldown > 0) return;
    if (!auth.currentUser) {
      setSendError("Not signed in. Please sign up or log in first.");
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
      const msg: string = e?.message ?? "Failed to send code.";
      setSendError(msg);
    } finally {
      setSending(false);
    }
  };

  // Auto-send code on mount. Declared after handleSendCode so the effect never
  // references it before initialisation (react-hooks/immutability).
  // Mount only: a dependency on handleSendCode (new every render) would re-send
  // on each render. The setState inside is the request's own state, not derived
  // state, so set-state-in-effect does not apply.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off a network request
    handleSendCode();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      /* ignore */
    }
    router.replace("/(auth)/login");
  };

  const handleDigitChange = (text: string, index: number) => {
    if (verifyError) setVerifyError(null);
    // Strip anything that isn't a letter or digit, uppercase, take the last
    // character. Lets users paste the whole code (handled below via length>1).
    const cleaned = text.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

    // Paste of full code: distribute across boxes starting at this index.
    if (cleaned.length > 1) {
      const next = [...digits];
      for (let i = 0; i < CODE_LENGTH - index && i < cleaned.length; i++) {
        next[index + i] = cleaned[i];
      }
      setDigits(next);
      const lastFilled = Math.min(index + cleaned.length, CODE_LENGTH) - 1;
      inputRefs.current[Math.min(lastFilled + 1, CODE_LENGTH - 1)]?.focus();
      if (next.every((d) => d !== "")) handleVerify(next.join(""));
      return;
    }

    const char = cleaned.slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);

    if (char && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    if (char && next.every((d) => d !== "")) {
      handleVerify(next.join(""));
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (code?: string) => {
    if (verifying) return;

    const enteredCode = code ?? digits.join("");

    if (!enteredCode || enteredCode.length !== CODE_LENGTH) {
      setVerifyError("Please enter all 6 characters of the code.");
      return;
    }

    setVerifyError(null);
    setVerifying(true);
    try {
      await verifyCodeFn({ code: enteredCode });
      Events.emailVerified();
    } catch (e: any) {
      const msg = e?.message ?? "Something went wrong.";
      setVerifyError(msg);
      setDigits(Array(CODE_LENGTH).fill(""));
      setVerifying(false); // focus is restored by the effect below, once the boxes are editable again
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

  // Return focus to the first empty box after an error. Done in an effect, not
  // in handleVerify's catch, because the boxes are non-editable until the render
  // that clears `verifying` — focusing them before that is a no-op.
  useEffect(() => {
    if (!verifyError || verifying) return;
    const firstEmpty = digits.findIndex((d) => !d);
    inputRefs.current[firstEmpty === -1 ? 0 : firstEmpty]?.focus();
  }, [verifyError, verifying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate once verified AND AI content is ready
  useEffect(() => {
    if (verified && horoscopeReady) router.replace("/(main)");
  }, [verified, horoscopeReady]);

  // Safety net: if the horoscope is still generating 30s after verification,
  // navigate anyway — the main app can render with partial data and the
  // subscriptions will fill in the rest as docs arrive.
  useEffect(() => {
    if (!verified) return;
    const timeout = setTimeout(() => router.replace("/(main)"), 30000);
    return () => clearTimeout(timeout);
  }, [verified]);

  // No full-screen loader while verifying: the form stays mounted so focus can
  // return to it on failure, and the Verify button shows "Verifying…" instead.

  // Still waiting for AI generation after verification
  if (verified) {
    return <LoadingScreen progress={horoscope ? 0.6 : 0.1} />;
  }

  const email = authUser?.email ?? "";

  return (
    <>
      <StatusBar style="light" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ImageBackground
          source={theme.backgroundImage}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />

        <ThemedView style={{ flex: 1 }}>
          <BlurView intensity={90} tint="dark" style={styles.card}>
            <LinearGradient
              colors={[
                "rgba(255,255,255,0.05)",
                "rgba(128,128,128,0.05)",
                "rgba(0,0,0,0.05)",
              ]}
              locations={[0, 0.49, 1]}
              style={StyleSheet.absoluteFill}
            >
              {/* Back button */}
              <SafeAreaView style={styles.topBar}>
                <TouchableOpacity
                  onPress={handleSignOut}
                  style={styles.backButton}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  accessibilityHint="Signs you out and returns to sign in"
                >
                  <ThemedText style={styles.backText}>← Back</ThemedText>
                </TouchableOpacity>
              </SafeAreaView>

              <ScrollView
                contentContainerStyle={styles.body}
                keyboardShouldPersistTaps="handled"
              >
                {/* Header */}
                <ThemedText style={styles.title} accessibilityRole="header">
                  Verify your email
                </ThemedText>

                {sendError ? (
                  <ThemedView style={styles.errorBox}>
                    <ThemedText style={styles.errorText}>
                      Could not send code
                    </ThemedText>
                    <ThemedText style={styles.errorDetail}>
                      {sendError}
                    </ThemedText>
                  </ThemedView>
                ) : (
                  <ThemedView
                    style={styles.emailRow}
                    // One stop for "Code sent to" + the address, not two
                    accessible
                    accessibilityLabel={codeSent ? `Code sent to ${email}` : undefined}
                  >
                    <ThemedText style={styles.subtitle}>
                      {codeSent
                        ? "Code sent to"
                        : sending
                          ? "Sending code…"
                          : "Preparing your code…"}
                    </ThemedText>
                    {codeSent && (
                      <ThemedText style={styles.emailDisplay}>
                        {email}
                      </ThemedText>
                    )}
                  </ThemedView>
                )}

                {/* Code input boxes */}
                <View style={styles.codeRow}>
                  {digits.map((d, i) => (
                    <TextInput
                      key={i}
                      ref={(el) => {
                        inputRefs.current[i] = el;
                      }}
                      style={[
                        styles.digitBox,
                        d ? styles.digitBoxFilled : null,
                      ]}
                      accessibilityLabel={`Verification code, character ${i + 1} of ${CODE_LENGTH}`}
                      value={d}
                      onChangeText={(text) => handleDigitChange(text, i)}
                      onKeyPress={({ nativeEvent }) =>
                        handleKeyPress(nativeEvent.key, i)
                      }
                      keyboardType={
                        Platform.OS === "ios" ? "ascii-capable" : "default"
                      }
                      autoCapitalize="characters"
                      autoCorrect={false}
                      // First box only: iOS / Android fill the whole code into
                      // it and the paste branch of handleDigitChange spreads it.
                      autoComplete={i === 0 ? "one-time-code" : "off"}
                      textContentType={i === 0 ? "oneTimeCode" : "none"}
                      maxFontSizeMultiplier={1.4}
                      editable={!verifying}
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
                  <ThemedText style={styles.verifyError}>
                    {verifyError}
                  </ThemedText>
                )}

                {/* Verify button */}
                <TouchableOpacity
                  style={[
                    styles.verifyButton,
                    (verifying || sending) && { opacity: 0.6 },
                  ]}
                  onPress={() => handleVerify()}
                  disabled={verifying || sending}
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: verifying || sending,
                    busy: verifying,
                  }}
                >
                  <ThemedText style={styles.verifyButtonText}>
                    {verifying ? "Verifying…" : "Verify"}
                  </ThemedText>
                </TouchableOpacity>

                {/* Resend */}
                <TouchableOpacity
                  onPress={handleSendCode}
                  disabled={sending || resendCooldown > 0}
                  style={styles.resendButton}
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: sending || resendCooldown > 0,
                  }}
                >
                  <ThemedText
                    style={[
                      styles.resendText,
                      (sending || resendCooldown > 0) && { opacity: 0.45 },
                    ]}
                  >
                    {resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : sending
                        ? "Sending…"
                        : "Resend code"}
                  </ThemedText>
                </TouchableOpacity>

                {/* Sign out link */}
                <TouchableOpacity
                  onPress={handleSignOut}
                  style={styles.signOutButton}
                  accessibilityRole="button"
                  accessibilityHint="Signs you out"
                >
                  <ThemedText style={styles.signOutText}>
                    Use a different account
                  </ThemedText>
                </TouchableOpacity>
              </ScrollView>
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
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: moderateScale(25),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(10),
  },
  topBar: {
    paddingHorizontal: scale(16),
    paddingTop: Platform.OS === "android" ? verticalScale(16) : 0,
  },
  backButton: {
    minHeight: MIN_TARGET,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  backText: {
    color: "rgba(111,255,233,0.9)",
    fontSize: moderateScale(17),
    fontWeight: "500",
  },
  body: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: scale(24),
    gap: scale(12),
  },
  errorBox: {
    width: "100%",
    backgroundColor: "rgba(255,80,80,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,80,80,0.4)",
    borderRadius: moderateScale(12),
    padding: scale(14),
    alignItems: "center",
    gap: scale(6),
    marginBottom: verticalScale(8),
  },
  errorText: {
    color: "#ff8080",
    fontWeight: "700",
    fontSize: moderateScale(14),
  },
  errorDetail: {
    color: "rgba(255,255,255,0.75)", // was 0.55 at 12pt — the dimmest text on screen, carrying the error
    fontSize: moderateScale(13),
    textAlign: "center",
  },
  title: {
    fontSize: moderateScale(26),
    fontWeight: "700",
    color: "white",
    textAlign: "center",
    marginBottom: verticalScale(4),
  },
  subtitle: {
    fontSize: moderateScale(14),
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    marginBottom: verticalScale(16),
  },
  codeRow: {
    flexDirection: "row",
    gap: scale(10),
    marginBottom: verticalScale(24),
  },
  digitBox: {
    width: scale(44),
    height: verticalScale(56),
    borderRadius: moderateScale(10),
    borderWidth: 1.5,
    borderColor: "rgba(167,139,250,0.4)",
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "white",
    fontSize: moderateScale(24),
    fontWeight: "700",
  },
  digitBoxFilled: {
    borderColor: "rgba(167,139,250,0.9)",
    backgroundColor: "rgba(167,139,250,0.12)",
  },
  verifyButton: {
    width: "80%",
    backgroundColor: "rgba(167,139,250,0.5)",
    borderRadius: moderateScale(40),
    paddingVertical: verticalScale(15),
    alignItems: "center",
  },
  verifyButtonText: {
    color: "white",
    fontSize: moderateScale(18),
    fontWeight: "600",
  },
  resendButton: {
    minHeight: MIN_TARGET,
    justifyContent: "center",
  },
  resendText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: moderateScale(14),
    textDecorationLine: "underline",
  },
  signOutButton: {
    minHeight: MIN_TARGET,
    justifyContent: "center",
    marginTop: verticalScale(4),
  },
  signOutText: {
    color: "rgba(255,255,255,0.6)", // was 0.35, ~3:1 on the dark card
    fontSize: moderateScale(13),
  },
  verifyError: {
    color: "#ff8080",
    fontSize: moderateScale(13),
    textAlign: "center",
  },
  emailRow: {
    alignItems: "center",
    gap: scale(2),
    marginBottom: verticalScale(8),
  },
  emailDisplay: {
    color: "white",
    fontSize: moderateScale(14),
    fontWeight: "600",
    textAlign: "center",
  },
});
