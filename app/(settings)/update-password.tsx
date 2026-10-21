import React, { useContext, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  StatusBar,
  StyleSheet,
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getAuth,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  signOut,
} from 'firebase/auth';
import { GlassButton } from '@/src/assets/buttons/glass-button';
import { scale, moderateScale, verticalScale } from '@/src/utils/responsive';
import { ThemeContext } from '@/src/context/theme-context';
import { revokeMyRefreshTokens } from '@/src/services/user.service';
import { useAnnounce } from '@/src/hooks/use-announce';
import { logger } from '@/src/utils/logger';

type RuleKey = 'length' | 'uppercase' | 'lowercase' | 'number' | 'noWhitespace';

const RULES: { key: RuleKey; label: string; test: (s: string) => boolean }[] = [
  { key: 'length', label: 'At least 8 characters', test: (s) => s.length >= 8 },
  { key: 'uppercase', label: 'One uppercase letter (A–Z)', test: (s) => /[A-Z]/.test(s) },
  { key: 'lowercase', label: 'One lowercase letter (a–z)', test: (s) => /[a-z]/.test(s) },
  { key: 'number', label: 'One number (0–9)', test: (s) => /\d/.test(s) },
  { key: 'noWhitespace', label: 'No spaces or whitespace', test: (s) => s.length > 0 && !/\s/.test(s) },
];

export default function UpdatePasswordScreen() {
  const { theme } = useContext(ThemeContext);
  const insets = useSafeAreaInsets();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const currentRef = React.useRef<TextInput>(null);

  const ruleStatus = useMemo(
    () => RULES.map((r) => ({ ...r, passed: r.test(newPassword) })),
    [newPassword]
  );
  const allRulesPassed = ruleStatus.every((r) => r.passed);
  const confirmMatches = confirmPassword.length > 0 && newPassword === confirmPassword;
  const sameAsCurrent = newPassword.length > 0 && newPassword === currentPassword;

  const canSubmit =
    !submitting &&
    currentPassword.length > 0 &&
    allRulesPassed &&
    confirmMatches &&
    !sameAsCurrent;

  const handleCancel = () => {
    router.replace('/(settings)/profile');
  };

  const handleChange = async () => {
    if (!canSubmit) return;

    const auth = getAuth();
    const user = auth.currentUser;
    if (!user || !user.email) {
      Alert.alert('Error', 'No logged-in user found.');
      return;
    }

    setSubmitting(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      // Invalidate any other devices that still hold tokens issued under the
      // old password. Done while the user is still authenticated locally.
      await revokeMyRefreshTokens();
      Alert.alert('Success', 'Your password has been changed. Please sign in again.', [
        {
          text: 'OK',
          onPress: async () => {
            await signOut(auth);
            router.replace('/(startup)/welcome');
          },
        },
      ]);
    } catch (error: any) {
      logger.error('[update-password] change failed', error, 'update_password');
      const code = error?.code ?? '';
      const message =
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Current password is incorrect.'
          : code === 'auth/too-many-requests'
          ? 'Too many attempts. Please try again later.'
          : code === 'auth/network-request-failed'
          ? 'Network error. Check your connection and try again.'
          : code === 'auth/weak-password'
          ? 'New password is too weak.'
          : 'An error occurred. Please try again.';
      // A wrong current password sends focus back to that field once dismissed.
      const isWrongCurrent = code === 'auth/wrong-password' || code === 'auth/invalid-credential';
      Alert.alert(
        'Error',
        message,
        isWrongCurrent ? [{ text: 'OK', onPress: () => currentRef.current?.focus() }] : undefined,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (
    label: string,
    placeholder: string,
    value: string,
    setValue: (s: string) => void,
    visible: boolean,
    setVisible: (v: boolean) => void,
    autoComplete: 'password' | 'new-password',
    testID: string,
    inputRef?: React.RefObject<TextInput | null>
  ) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          ref={inputRef}
          testID={testID}
          style={styles.input}
          accessibilityLabel={label}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.6)"
          secureTextEntry={!visible}
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={autoComplete === 'password' ? 'password' : 'newPassword'}
        />
        <TouchableOpacity
          onPress={() => setVisible(!visible)}
          style={styles.eyeButton}
          accessibilityRole="button"
          accessibilityLabel={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={moderateScale(20)}
            color="rgba(255,255,255,0.85)"
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  const content = (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: verticalScale(40) + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
      >
        {/* In normal flow, not absolute: overlaid, it covered scrolled content
            and the focused field at large text sizes (WCAG 2.4.11). */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
          accessibilityRole="button"
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        <View style={styles.topSpacer} />

        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">Change Password</Text>
          <Text style={styles.subtitle}>
            Re-enter your current password, then choose a new one.
          </Text>
        </View>

        {renderField(
          'Current Password',
          'Enter current password',
          currentPassword,
          setCurrentPassword,
          showCurrent,
          setShowCurrent,
          'password',
          'current-password',
          currentRef
        )}

        {renderField(
          'New Password',
          'Enter new password',
          newPassword,
          setNewPassword,
          showNew,
          setShowNew,
          'new-password',
          'new-password'
        )}

        <View style={styles.rulesBox}>
          <Text style={styles.rulesTitle}>Password must contain:</Text>
          {ruleStatus.map((r) => (
            // Met / not met was only an icon and a colour
            <View
              key={r.key}
              style={styles.ruleRow}
              accessible
              accessibilityLabel={`${r.label}, ${r.passed ? 'met' : 'not met'}`}
            >
              <Ionicons
                name={r.passed ? 'checkmark-circle' : 'ellipse-outline'}
                size={moderateScale(16)}
                color={r.passed ? '#6FFFE9' : 'rgba(255,255,255,0.6)'}
              />
              <Text
                style={[
                  styles.ruleText,
                  r.passed && { color: '#6FFFE9' },
                ]}
              >
                {r.label}
              </Text>
            </View>
          ))}
          {sameAsCurrent && (
            <View style={styles.ruleRow}>
              <Ionicons
                name="alert-circle"
                size={moderateScale(16)}
                color="#FF8A8A"
              />
              <Text style={[styles.ruleText, { color: '#FF8A8A' }]}>
                New password must differ from current password
              </Text>
            </View>
          )}
        </View>

        {renderField(
          'Confirm New Password',
          'Re-enter new password',
          confirmPassword,
          setConfirmPassword,
          showConfirm,
          setShowConfirm,
          'new-password',
          'confirm-password'
        )}

        {confirmPassword.length > 0 && (
          <View style={styles.matchRow} accessible>
            <Ionicons
              name={confirmMatches ? 'checkmark-circle' : 'close-circle'}
              size={moderateScale(16)}
              color={confirmMatches ? '#6FFFE9' : '#FF8A8A'}
            />
            <Text
              style={[
                styles.ruleText,
                { color: confirmMatches ? '#6FFFE9' : '#FF8A8A' },
              ]}
            >
              {confirmMatches ? 'Passwords match' : 'Passwords do not match'}
            </Text>
          </View>
        )}

        <View style={styles.spacer} />

        <View style={styles.saveRow}>
          <GlassButton
            title={submitting ? 'Saving…' : 'Save Password'}
            onPress={handleChange}
            disabled={!canSubmit}
            busy={submitting}
          />
        </View>

        {submitting && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#fff" />
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (theme.backgroundType === 'image' && theme.backgroundImage) {
    return (
      <ImageBackground source={theme.backgroundImage} style={styles.background} resizeMode="cover">
        {content}
      </ImageBackground>
    );
  }
  if (theme.backgroundType === 'gradient' && theme.gradient) {
    return (
      <LinearGradient
        colors={theme.gradient.colors as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{
          x: Math.cos(((theme.gradient.angle ?? 0) * Math.PI) / 180),
          y: Math.sin(((theme.gradient.angle ?? 0) * Math.PI) / 180),
        }}
        style={styles.background}
      >
        {content}
      </LinearGradient>
    );
  }
  return (
    <View style={[styles.background, { backgroundColor: theme.colors.background }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  background: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: scale(20),
    // Room for the status bar, now that Cancel sits in the flow rather than over it
    paddingTop: Platform.OS === 'ios' ? verticalScale(50) : (StatusBar.currentHeight ?? 20) + verticalScale(8),
    paddingBottom: verticalScale(40),
  },
  topSpacer: { flex: 1, minHeight: verticalScale(8) },
  bottomSpacer: { flex: 1, minHeight: verticalScale(8) },
  fieldGroup: {
    width: '100%',
    marginBottom: verticalScale(14),
  },
  fieldLabel: {
    color: '#fff',
    fontSize: moderateScale(13),
    fontWeight: '600',
    marginBottom: verticalScale(6),
    marginLeft: scale(2),
  },
  cancelButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: scale(10),
    paddingRight: scale(10),
  },
  saveRow: { alignItems: 'center' },
  cancelButtonText: {
    color: '#6FFFE9',
    fontSize: moderateScale(16),
    fontWeight: '500',
  },
  header: {
    marginBottom: verticalScale(24),
    alignItems: 'center',
  },
  title: {
    fontSize: moderateScale(24),
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: verticalScale(8),
  },
  subtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: moderateScale(13),
    textAlign: 'center',
    paddingHorizontal: scale(10),
  },
  inputWrapper: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: moderateScale(8),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.25)',
  },
  input: {
    flex: 1,
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(12),
    color: '#fff',
    fontSize: moderateScale(16),
  },
  eyeButton: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
  },
  rulesBox: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: moderateScale(10),
    padding: scale(12),
    marginBottom: verticalScale(16),
  },
  rulesTitle: {
    color: '#fff',
    fontSize: moderateScale(13),
    fontWeight: '600',
    marginBottom: verticalScale(8),
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: verticalScale(2),
    gap: scale(8),
  },
  ruleText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: moderateScale(13),
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginTop: -verticalScale(8),
    marginBottom: verticalScale(8),
    paddingHorizontal: scale(4),
  },
  spacer: { height: verticalScale(12) },
  loadingRow: {
    marginTop: verticalScale(16),
    alignItems: 'center',
  },
});
