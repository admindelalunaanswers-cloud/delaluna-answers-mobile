import { View, Text, TextInput, Button, StyleSheet, ImageBackground, TouchableOpacity, Platform, StatusBar as RNStatusBar, Alert } from 'react-native';
import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';

// app/(auth)/forgotPassword.screen.tsx
export default function ForgotPasswordScreen() {
    var email = '';

    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    const cancelTop = insets.top + (height < 700 ? 4 : 16);

    const handleCancel = () => {
        router.replace('/(auth)/login');
    }

    return (
        <LinearGradient
            colors={['#2D1B42', '#3B235A', '#5A3E85']}
            locations={[0, 0.5, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.background}>
            <StatusBar style="light" translucent backgroundColor="transparent" />
            <View style={styles.container}>
                <TouchableOpacity
                    style={[styles.cancelButton, { top: cancelTop }]}
                    onPress={handleCancel}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Forgot Password</Text>
                <View style={styles.spacer} />
                <Text style={styles.description}>
                    Please enter your email address to reset your password.
                </Text>
                <View style={styles.spacer} />
                <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor="#fff"
                    onChangeText={(text) => email = text}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />

                <View style={styles.spacer} />

                <TouchableOpacity
                    style={styles.button}
                    onPress={() => {
                        const emailInput = email.trim();
                        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

                        // 1. Not empty
                        // 2. Valid email format
                        // 3. Not already registered (optional, can be checked in Firebase)
                        if (!email || emailInput === '' || emailInput.length === 0 || !emailRegex.test(emailInput)) {
                            alert('Please enter a valid email address.');
                            return;
                        }
                        else {
                            const auth = getAuth();
                            sendPasswordResetEmail(auth, email)
                                .then(() => {

                                    Alert.alert(
                                        "Password Reset", // <-- Custom title
                                        "If that email is registered, a reset link has been sent.\nIf you don't see it, please check your spam folder.",
                                        [{ text: "OK" }]
                                    );
                                    router.replace('/(auth)/login');
                                })
                                .catch((error) => {
                                    const errorCode = error.code;
                                    const errorMessage = error.message;
                                });
                        }
                    }}>
                    <Text style={styles.buttonText}>Send Reset Link</Text>
                </TouchableOpacity>
            </View>

        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    background: {
        flex: 1
    },
    header: {
        flex: 1,
        alignItems: 'flex-end',
        marginTop: 50,
        padding: 20,
    },
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        color: '#fff',
    },
    description: {
        fontSize: 16,
        marginBottom: 20,
        textAlign: 'center',
        color: '#fff',
    },
    input: {
        width: '100%',
        padding: 10,
        borderWidth: 1,
        borderBottomColor: '#ccc',
        borderTopColor: 'transparent',
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 5,
        marginBottom: 20,
        color: '#fff',
        fontSize: 16,
    },
    button: {
        outlineColor: '#5A3E85',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 6,
        alignSelf: 'stretch',
        marginTop: 20,
    },
    buttonText: {
        color: '#fff',
        textAlign: 'center',
        fontWeight: 'bold',
        fontSize: 16,
    },
    spacer: {
        height: 20,
    },
    cancelButton: {
        position: 'absolute',
        top: 5,
        left: 20,
        padding: 10,
    },
    cancelButtonText: {
        color: '#fff',
        fontSize: 16,
    },
});
