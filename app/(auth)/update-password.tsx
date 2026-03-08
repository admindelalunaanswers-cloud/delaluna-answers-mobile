// app/screens/changePassword.screen.tsx
import React, { useState, useContext } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  getAuth,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  signOut,
} from 'firebase/auth';
import GlassButton from '@/src/assets/buttons/glass-button';
import { scale, moderateScale, verticalScale } from '@/src/utils/responsive';
import { ThemeContext } from '@/src/context/theme-context';




// Helper to validate new password strength
function validatePassword(text: string): string {
  if (!text) {
    return 'Please enter a new password.';
  }
  if (text.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!/[A-Z]/.test(text)) {
    return 'Password must contain at least one uppercase letter.';
  }
  return '';
}

export default function UpdatePasswordScreen() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { theme } = useContext(ThemeContext);

  const handleCancel = () => {
    router.replace('/(settings)/profile');
  };

  const handleChange = async () => {
    const curr = currentPassword.trim();
    const next = newPassword.trim();
    const confirm = confirmPassword.trim();

    // 1. Current password must be at least 6 characters
    if (!curr || curr.length < 6) {
      Alert.alert('Validation', 'Please enter your current password (at least 6 characters).');
      return;
    }

    // 2. Validate new password strength
    const pwdError = validatePassword(next);
    if (pwdError) {
      Alert.alert('Validation', pwdError);
      return;
    }

    // 3. New vs Confirm match
    if (next !== confirm) {
      Alert.alert('Validation', 'New password and confirmation do not match.');
      return;
    }

    // 4. Firebase re-authentication and update
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user || !user.email) {
      Alert.alert('Error', 'No logged-in user found.');
      return;
    }

    try {
      const cred = EmailAuthProvider.credential(user.email, curr);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, next);
      Alert.alert('Success', 'Your password has been changed.', [
        { text: 'OK', onPress: async () => { await signOut(auth); router.replace('/(startup)/welcome'); } },
      ]);
    } catch (error: any) {
      console.error(error);
      const message =
        error.code === 'auth/wrong-password'
          ? 'Current password is incorrect.'
          : 'An error occurred. Please try again.';
      Alert.alert('Error', message);
    }
  };

  // Helper to render background using theme
  function renderBackground(children: React.ReactNode) {
    if (theme.backgroundType === 'image' && theme.backgroundImage) {
      return (
        <ImageBackground
          source={theme.backgroundImage}
          style={styles.background}
          resizeMode="cover"
        >
          {children}
        </ImageBackground>
      );
    }
    if (theme.backgroundType === 'gradient' && theme.gradient) {
      return (
        <LinearGradient
          colors={theme.gradient.colors as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{
            x: Math.cos((theme.gradient.angle ?? 0) * Math.PI / 180),
            y: Math.sin((theme.gradient.angle ?? 0) * Math.PI / 180),
          }}
          style={styles.background}
        >
          {children}
        </LinearGradient>
      );
    }
    return (
      <View style={[styles.background, { backgroundColor: theme.colors.background }]}>
        {children}
      </View>
    );
  }

  return renderBackground(
    <View style={styles.container}>
      <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Change Password</Text>
      <View style={styles.spacer} />

      <TextInput
        style={styles.input}
        placeholder="Current Password"
        placeholderTextColor="#fff"
        secureTextEntry
        value={currentPassword}
        onChangeText={setCurrentPassword}
      />
      <View style={styles.spacer} />

      <TextInput
        style={styles.input}
        placeholder="New Password"
        placeholderTextColor="#fff"
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
      />
      <View style={styles.spacer} />

      <TextInput
        style={styles.input}
        placeholder="Confirm New Password"
        placeholderTextColor="#fff"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />
      <View style={styles.spacer} />

      <GlassButton
        title="Save Password"
        onPress={handleChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(20),
  },
  title: {
    fontSize: moderateScale(24),
    fontWeight: 'bold',
    marginBottom: verticalScale(20),
    color: '#fff',
  },
  spacer: { height: verticalScale(20) },
  input: {
    width: '100%',
    padding: scale(10),
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: moderateScale(5),
    color: '#fff',
    fontSize: moderateScale(16),
  },
  button: {
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(24),
    borderRadius: moderateScale(6),
    alignSelf: 'stretch',
    marginTop: verticalScale(20),
    backgroundColor: '#5A3E85',
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: moderateScale(16),
  },
  cancelButton: {
    position: 'absolute',
    top: Platform.OS === 'android' ? StatusBar.currentHeight || 20 : 50,
    left: scale(20),
    padding: scale(10),
  },
  cancelButtonText: { color: '#fff', fontSize: moderateScale(16) },
});
