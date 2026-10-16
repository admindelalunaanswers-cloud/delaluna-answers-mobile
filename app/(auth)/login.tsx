import React, { useContext, useEffect, useRef, useState } from "react";

import {
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, serverTimestamp } from "firebase/firestore";

import { auth, db } from "@/firebaseConfig";
import SecondaryButton from "@/src/assets/buttons/secondary-button-component";
import { ThemedText } from "@/src/components/themed-text";
import { ThemeContext } from "@/src/context/theme-context";
import { useUser } from "@/src/context/user-context";
import { Events } from "@/src/services/analytics.service";
import { updateUserDoc } from "@/src/services/user.service";
import { MAX_CONTENT_WIDTH } from "@/src/utils/layout";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";

import { logger } from "@/src/utils/logger";
import LoadingScreen from "../(util)/loading-screen";

// Safe AsyncStorage wrapper (mirrors theme-context pattern)
let AsyncStorage: {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
};
try {
  AsyncStorage = require("@react-native-async-storage/async-storage").default;
} catch {
  AsyncStorage = { getItem: async () => null, setItem: async () => {} };
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [skipAutoRedirect, setSkipAutoRedirect] = useState(false);

  const { authUser, loading: initializing } = useUser();
  const router = useRouter();
  const { setThemeKey } = useContext(ThemeContext);
  const insets = useSafeAreaInsets();

  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!skipAutoRedirect && !initializing && authUser) {
      router.replace("/(main)");
    }
  }, [initializing, authUser, skipAutoRedirect]);

  if (initializing) {
    return <LoadingScreen message="Initializing..." />;
  }

  const resolveThemeBeforeNavigate = async (uid: string): Promise<string> => {
    const fetchFromFirestore = async () => {
      const snap = await getDoc(doc(db, "users", uid));
      return snap.exists() && snap.data().themeKey
        ? String(snap.data().themeKey)
        : "default";
    };

    return Promise.race<string>([
      fetchFromFirestore(),
      new Promise<string>(async (resolve) => {
        setTimeout(async () => {
          const cached = (await AsyncStorage.getItem("themeKey")) || "default";
          resolve(cached);
        }, 3000);
      }),
    ]);
  };

  const handleLogin = async () => {
    if (loading) return;

    if (!email.trim() && !password.trim()) {
      return Alert.alert("Invalid Login", "Email and password are required.");
    }
    if (!email.trim()) {
      return Alert.alert("Invalid Login", "Please enter your email.");
    }
    if (!password.trim()) {
      return Alert.alert("Invalid Login", "Please enter your password.");
    }

    try {
      setLoading(true);
      setSkipAutoRedirect(true);

      // Trim email only — passwords are sent verbatim. Trimming the password
      // would silently strip legitimate characters and lock out users whose
      // passwords contain whitespace (or whose password manager appended a
      // newline on paste).
      const cred = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );

      Events.login("email");

      // Record login timestamp on every login
      updateUserDoc(cred.user.uid, {
        lastLoggedInAt: serverTimestamp() as any,
      }).catch(logger.catchAsync("login_touch_last_login"));

      const key = await resolveThemeBeforeNavigate(cred.user.uid);
      await Promise.resolve(setThemeKey(key));

      router.replace("/(main)");
    } catch (e: any) {
      const invalidCredCodes = new Set([
        "auth/invalid-credential",
        "auth/invalid-login-credentials",
        "auth/wrong-password",
        "auth/invalid-password",
        "auth/user-not-found",
        "auth/invalid-email",
      ]);

      if (invalidCredCodes.has(e?.code)) {
        Alert.alert("Login failed", "Incorrect email or password.");
      } else {
        Alert.alert("Login failed", e?.message ?? "Login failed.");
      }
    } finally {
      setLoading(false);
      setSkipAutoRedirect(false);
    }
  };

  return (
    <>
      <StatusBar style="light" />

      <ImageBackground
        source={require("@/src/assets/start-up/welcome-background.jpg")}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.logoContainer, { paddingTop: 55 }]}>
              <Image
                source={require("@/src/assets/dlla-branded/delaluna_logo.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            <BlurView intensity={90} tint="dark" style={styles.card}>
              <LinearGradient
                colors={[
                  "rgba(255,255,255,0.05)",
                  "rgba(128,128,128,0.05)",
                  "rgba(0,0,0,0.05)",
                ]}
                locations={[0, 0.49, 1]}
                style={StyleSheet.absoluteFill}
              />

              <View style={styles.bodyContainer}>
                <View style={styles.form}>
                  {/* EMAIL */}
                  <TextInput
                    placeholder="Email"
                    placeholderTextColor="rgba(255, 255, 255, 0.5)"
                    style={styles.textField}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />

                  {/* PASSWORD */}
                  <View style={styles.passwordWrapper}>
                    <TextInput
                      ref={passwordRef}
                      placeholder="Password"
                      placeholderTextColor="rgba(255, 255, 255, 0.5)"
                      style={[styles.textField, styles.passwordField]}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoComplete="current-password"
                      textContentType="password"
                      returnKeyType="done"
                      onSubmitEditing={handleLogin}
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowPassword((v) => !v)}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off" : "eye"}
                        size={moderateScale(20)}
                        color="rgba(255,255,255,0.6)"
                      />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.forgotPasswordButton}
                    onPress={() => router.replace("/(auth)/forgot-password")}
                  >
                    <ThemedText style={styles.forgotPassword}>
                      Forgot Password?
                    </ThemedText>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.loginButton, loading && { opacity: 0.6 }]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  <ThemedText style={styles.loginButtonText}>
                    {loading ? "Signing in\u2026" : "Login"}
                  </ThemedText>
                </TouchableOpacity>

                <View
                  style={{
                    paddingBottom:
                      insets.bottom > 0 ? insets.bottom : verticalScale(16),
                  }}
                >
                  <SecondaryButton
                    title="Not a member? "
                    linkString="Sign up"
                    onPress={() => router.replace("/(auth)/sign-up")}
                  />
                </View>
              </View>
            </BlurView>
          </ScrollView>
        </KeyboardAvoidingView>
      </ImageBackground>
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
  },
  logoContainer: {
    flex: 1,
    minHeight: verticalScale(90),
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: scale(285),
    height: verticalScale(120),
  },
  card: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderTopLeftRadius: moderateScale(25),
    borderTopRightRadius: moderateScale(25),
    paddingHorizontal: scale(10),
    paddingTop: verticalScale(10),
    overflow: "hidden",
  },
  bodyContainer: {
    width: "100%",
    marginTop: verticalScale(5),
    alignItems: "center",
    gap: verticalScale(20),
  },
  form: {
    width: "90%",
    justifyContent: "center",
    gap: scale(5),
    marginTop: verticalScale(25),
  },
  textField: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: moderateScale(12),
    borderWidth: 1,
    borderColor: "rgba(142,68,173,0.6)",
    marginBottom: verticalScale(15),
    paddingHorizontal: scale(15),
    height: verticalScale(48),
    color: "white",
  },
  passwordWrapper: {
    position: "relative",
    justifyContent: "center",
  },
  passwordField: {
    paddingRight: scale(45),
    marginBottom: 0,
  },
  eyeButton: {
    position: "absolute",
    right: scale(15),
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  forgotPassword: {
    color: "white",
    fontSize: moderateScale(13),
    fontWeight: "600",
    textAlign: "right",
    margin: scale(10),
  },
  forgotPasswordButton: { alignSelf: "flex-end" },
  loginButton: {
    width: "80%",
    backgroundColor: "rgba(255,255,255,0.5)",
    borderRadius: moderateScale(40),
    paddingVertical: verticalScale(15),
    justifyContent: "center",
    alignItems: "center",
  },
  loginButtonText: {
    color: "white",
    fontSize: moderateScale(20),
    fontWeight: "600",
  },
});
