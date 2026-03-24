import React, { useContext, useEffect, useState, useRef } from 'react';

import {
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Image,
  View,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  KeyboardEvent,
  Alert,
} from 'react-native';

import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { doc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';

import SecondaryButton from '@/src/assets/buttons/secondary-button-component';
import { ThemeContext } from '@/src/context/theme-context';
import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { auth, db } from '@/firebaseConfig';
import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';
import { updateUserDoc, isAdminEmail } from '@/src/services/user.service';
import { useUser } from '@/src/context/user-context';

import LoadingScreen from '../(util)/loading-screen';

// Safe AsyncStorage wrapper (mirrors theme-context pattern)
let AsyncStorage: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> };
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  AsyncStorage = { getItem: async () => null, setItem: async () => {} };
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [skipAutoRedirect, setSkipAutoRedirect] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);

  const { authUser, loading: initializing } = useUser();
  const router = useRouter();
  const { setThemeKey } = useContext(ThemeContext);
  const insets = useSafeAreaInsets();

  const passwordRef = useRef<TextInput>(null);

  // Keyboard is up when kbHeight > 0 — hide logo to free space for the form
  const showLogo = kbHeight === 0;

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const s1 = Keyboard.addListener(showEvt, (e: KeyboardEvent) =>
      setKbHeight(e.endCoordinates.height));
    const s2 = Keyboard.addListener(hideEvt, () => setKbHeight(0));

    return () => { s1.remove(); s2.remove(); };
  }, []);

  useEffect(() => {
    if (!skipAutoRedirect && !initializing && authUser) {
      router.replace('/(main)');
    }
  }, [initializing, authUser, skipAutoRedirect]);

  if (initializing) {
    return <LoadingScreen message="Initializing..." />;
  }

  const resolveThemeBeforeNavigate = async (uid: string): Promise<string> => {
    const fetchFromFirestore = async () => {
      const snap = await getDoc(doc(db, 'users', uid));
      return snap.exists() && snap.data().themeKey
        ? String(snap.data().themeKey)
        : 'default';
    };

    return Promise.race<string>([
      fetchFromFirestore(),
      new Promise<string>(async (resolve) => {
        setTimeout(async () => {
          const cached = (await AsyncStorage.getItem('themeKey')) || 'default';
          resolve(cached);
        }, 3000);
      }),
    ]);
  };

  const handleLogin = async () => {
    if (loading) return;

    if (!email.trim() && !password.trim()) {
      return Alert.alert('Invalid Login', 'Email and password are required.');
    }
    if (!email.trim()) {
      return Alert.alert('Invalid Login', 'Please enter your email.');
    }
    if (!password.trim()) {
      return Alert.alert('Invalid Login', 'Please enter your password.');
    }

    try {
      setLoading(true);
      setSkipAutoRedirect(true);

      const cred = await signInWithEmailAndPassword(auth, email.trim(), password.trim());

      // Sync isAdmin on every login — catches promotions/removals since last sign-up
      updateUserDoc(cred.user.uid, { isAdmin: isAdminEmail(email.trim().toLowerCase()) }).catch(console.error);

      const key = await resolveThemeBeforeNavigate(cred.user.uid);
      await Promise.resolve(setThemeKey(key));

      router.replace('/(main)');
    } catch (e: any) {
      const invalidCredCodes = new Set([
        'auth/invalid-credential',
        'auth/invalid-login-credentials',
        'auth/wrong-password',
        'auth/invalid-password',
        'auth/user-not-found',
        'auth/invalid-email',
      ]);

      if (invalidCredCodes.has(e?.code)) {
        Alert.alert('Login failed', 'Incorrect email or password.');
      } else {
        Alert.alert('Login failed', e?.message ?? 'Login failed.');
      }
    } finally {
      setLoading(false);
      setSkipAutoRedirect(false);
    }
  };

  return (
    <>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <ImageBackground
        source={require('@/src/assets/start-up/welcome-background.jpg')}
        style={{ flex: 1 }}
        resizeMode="stretch"
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <ThemedView style={[styles.container, kbHeight > 0 && { paddingTop: insets.top }]}>

          {showLogo && (
            <ThemedView style={styles.logoContainer}>
              <Image
                source={require('@/src/assets/dlla-branded/delaluna_logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </ThemedView>
          )}

          <BlurView intensity={90} tint="dark" style={styles.card}>
            <LinearGradient
              colors={['rgba(255,255,255,0.05)', 'rgba(128,128,128,0.05)', 'rgba(0,0,0,0.05)']}
              locations={[0, 0.49, 1]}
              style={StyleSheet.absoluteFillObject}
            />

            <ThemedView style={styles.bodyContainer}>
              <ThemedView style={[styles.form, Platform.OS === 'android' && kbHeight > 0 && { marginTop: verticalScale(20),}]}>
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
                  submitBehavior="submit"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />

                {/* PASSWORD */}
                <ThemedView style={styles.passwordWrapper}>
                  <TextInput
                    ref={passwordRef}
                    placeholder="Password"
                    placeholderTextColor="rgba(255, 255, 255, 0.5)"
                    style={[styles.textField, styles.passwordField]}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    submitBehavior="submit"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(v => !v)}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={moderateScale(20)}
                      color="rgba(255,255,255,0.6)"
                    />
                  </TouchableOpacity>
                </ThemedView>

                <TouchableOpacity
                  style={styles.forgotPasswordButton}
                  onPress={() => router.replace('/(auth)/forgot-password')}
                >
                  <ThemedText style={styles.forgotPassword}>Forgot Password?</ThemedText>
                </TouchableOpacity>
              </ThemedView>

              <TouchableOpacity
                style={[styles.loginButton, loading && { opacity: 0.6 }]}
                onPress={handleLogin}
                disabled={loading}
              >
                <ThemedText style={styles.loginButtonText}>
                  {loading ? 'Signing in…' : 'Login'}
                </ThemedText>
              </TouchableOpacity>

              <View style={Platform.OS === 'android' && kbHeight > 0 ? { marginBottom: verticalScale(25) } : undefined}>
                <SecondaryButton
                  title="Not a member? "
                  linkString="Sign up"
                  onPress={() => router.replace('/(auth)/sign-up')}
                />
              </View>
            </ThemedView>
          </BlurView>

        </ThemedView>
        </KeyboardAvoidingView>
      </ImageBackground>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  logoContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  logo: { width: '80%', height: '85%' },
  card: {
    width: '100%',
    flex: 1.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: moderateScale(25),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(10),
    overflow: 'hidden',
  },
  bodyContainer: {
    width: '100%',
    flex: 1,
    marginTop: verticalScale(5),
    marginBottom: verticalScale(10),
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: scale(5),
  },
  form: {
    width: '90%',
    justifyContent: 'center',
    gap: scale(5),
    marginTop: verticalScale(25),
  },
  textField: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: moderateScale(12),
    borderWidth: 1,
    borderColor: 'rgba(142,68,173,0.6)',
    marginBottom: verticalScale(15),
    paddingHorizontal: scale(15),
    height: verticalScale(48),
    color: 'white',
  },
  passwordWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordField: {
    paddingRight: scale(45),
    marginBottom: 0,
  },
  eyeButton: {
    position: 'absolute',
    right: scale(15),
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  forgotPassword: {
    color: 'white',
    fontSize: moderateScale(13),
    fontWeight: '600',
    textAlign: 'right',
    margin: scale(10),
  },
  forgotPasswordButton: { alignSelf: 'flex-end' },
  loginButton: {
    width: '80%',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: moderateScale(40),
    paddingVertical: verticalScale(15),
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginButtonText: {
    color: 'white',
    fontSize: moderateScale(20),
    fontWeight: '600',
  },
});
