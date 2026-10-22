import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { sendPasswordResetEmail } from 'firebase/auth';
import React, { useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Text, TextInput } from '@/src/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { auth } from '@/firebaseConfig';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const MIN_TARGET = 44;

function resetErrorMessage(code: string): string {
    switch (code) {
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/network-request-failed':
            return 'Network error. Please check your connection and try again.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Please wait a moment and try again.';
        default:
            return 'Could not send the reset link. Please try again.';
    }
}

export default function ForgotPasswordScreen() {
    // State, not a local variable — a local is reset by every re-render
    // (split-screen, resize) while the uncontrolled input still shows the text.
    const [email, setEmail] = useState('');
    const [sending, setSending] = useState(false);
    const emailRef = useRef<TextInput>(null);

    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    const cancelTop = insets.top + (height < 700 ? 4 : 16);

    const focusEmail = [{ text: 'OK', onPress: () => emailRef.current?.focus() }];

    const handleSend = async () => {
        if (sending) return;
        const trimmed = email.trim();
        if (!EMAIL_REGEX.test(trimmed)) {
            Alert.alert('Invalid Email', 'Please enter a valid email address.', focusEmail);
            return;
        }

        setSending(true);
        try {
            // Send the trimmed address — the one that was validated.
            await sendPasswordResetEmail(auth, trimmed);
            Alert.alert(
                'Password Reset',
                "If that email is registered, a reset link has been sent.\nIf you don't see it, please check your spam folder.",
            );
            router.replace('/(auth)/login');
        } catch (err: any) {
            Alert.alert('Reset Failed', resetErrorMessage(err?.code ?? ''), focusEmail);
        } finally {
            setSending(false);
        }
    };

    return (
        <LinearGradient
            colors={['#2D1B42', '#3B235A', '#5A3E85']}
            locations={[0, 0.5, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.background}>
            <StatusBar style="light" />
            <KeyboardAvoidingView
                style={styles.background}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                {/* First in the tree so screen readers reach it first. In normal flow,
                    not absolute: overlaid, it covered scrolled content and the focused
                    input at large text sizes (WCAG 2.4.11). */}
                <View style={[styles.header, { paddingTop: cancelTop }]}>
                    <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={() => router.replace('/(auth)/login')}
                        accessibilityRole="button"
                        accessibilityHint="Returns to sign in">
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView
                    contentContainerStyle={styles.container}
                    keyboardShouldPersistTaps="handled">
                    <Text style={styles.title} accessibilityRole="header">Forgot Password</Text>
                    <Text style={styles.description}>
                        Please enter your email address to reset your password.
                    </Text>
                    <TextInput
                        ref={emailRef}
                        style={styles.input}
                        accessibilityLabel="Email"
                        placeholder="Email"
                        placeholderTextColor="rgba(255, 255, 255, 0.6)"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        textContentType="emailAddress"
                        returnKeyType="send"
                        onSubmitEditing={handleSend}
                        editable={!sending}
                    />

                    <TouchableOpacity
                        style={[styles.button, sending && { opacity: 0.6 }]}
                        onPress={handleSend}
                        disabled={sending}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: sending, busy: sending }}>
                        <Text style={styles.buttonText}>
                            {sending ? 'Sending…' : 'Send Reset Link'}
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    background: {
        flex: 1
    },
    container: {
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 40,
        color: '#fff',
    },
    description: {
        fontSize: 16,
        marginBottom: 40,
        textAlign: 'center',
        color: '#fff',
    },
    input: {
        width: '100%',
        minHeight: MIN_TARGET,
        padding: 10,
        borderWidth: 1,
        borderBottomColor: '#ccc',
        borderTopColor: 'transparent',
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 5,
        marginBottom: 40,
        color: '#fff',
        fontSize: 16,
    },
    button: {
        minHeight: MIN_TARGET,
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 24,
        // Had no fill or border, so it read as bold body text rather than a button.
        // Same violet as verify-email's button; white text ≈ 5.4:1 on the blend.
        backgroundColor: 'rgba(167,139,250,0.5)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
        borderRadius: 40,
        alignSelf: 'stretch',
        marginTop: 20,
    },
    buttonText: {
        color: '#fff',
        textAlign: 'center',
        fontWeight: 'bold',
        fontSize: 16,
    },
    header: {
        paddingHorizontal: 20,
        alignItems: 'flex-start',
    },
    cancelButton: {
        minHeight: MIN_TARGET,
        justifyContent: 'center',
        paddingHorizontal: 10,
    },
    cancelButtonText: {
        color: '#fff',
        fontSize: 16,
    },
});
