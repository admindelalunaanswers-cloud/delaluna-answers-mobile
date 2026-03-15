import React, { useContext, useEffect, useState, useRef } from 'react';

import {
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Image,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
  Alert,
} from 'react-native';

import { useRouter } from 'expo-router';

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

  const { authUser, loading: initializing } = useUser();
  const router = useRouter();
  const { theme, setThemeKey } = useContext(ThemeContext);

  const passwordRef = useRef<TextInput>(null);
  const [kbVisible, setKbVisible] = useState(false);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const s1 = Keyboard.addListener(showEvt, () => setKbVisible(true));
    const s2 = Keyboard.addListener(hideEvt, () => setKbVisible(false));

    return () => {
      s1.remove();
      s2.remove();
    };
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
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <ThemedView style={[styles.logoContainer, kbVisible && styles.logoContainerCompact]}>
                <Image
                  source={require('@/src/assets/dlla-branded/delaluna_logo.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </ThemedView>

            <BlurView
              intensity={90}
              tint="dark"
              style={styles.card}
            >
              <LinearGradient
                colors={[
                  'rgba(255,255,255,0.05)',
                  'rgba(128,128,128,0.05)',
                  'rgba(0,0,0,0.05)',
                ]}
                locations={[0, 0.49, 1]}
                style={StyleSheet.absoluteFillObject}
              >
                <ThemedView style={styles.bodyContainer}>
                  <ThemedView style={styles.form}>
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
                        blurOnSubmit={false}
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

                  <SecondaryButton
                    title="Not a member? "
                    linkString="Sign up"
                    onPress={() => router.replace('/(auth)/sign-up')}
                  />
                </ThemedView>
              </LinearGradient>
            </BlurView>
          </ScrollView>
        </KeyboardAvoidingView>
      </ImageBackground>
    </>
  );
}

const styles = StyleSheet.create({
  logoContainer: { width: '100%', height: '50%', alignItems: 'center', justifyContent: 'flex-end' },
  logoContainerCompact: { height: '35%' },
  card: {
    width: '100%',
    flexGrow: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: moderateScale(25),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(10),
    justifyContent: 'space-between',
  },
  logo: { width: '80%', height: '85%' },
  bodyContainer: {
    width: '100%',
    marginTop: verticalScale(5),
    marginBottom: verticalScale(20),
    alignItems: 'center',
    flex: 1,
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
  },
  eyeButton: {
    position: 'absolute',
    right: scale(15),
    top: 0,
    bottom: verticalScale(15),
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
    marginTop: verticalScale(Platform.OS === 'ios' ? 5 : 15),
  },
  loginButtonText: {
    color: 'white',
    fontSize: moderateScale(20),
    fontWeight: '600',
  },
});
