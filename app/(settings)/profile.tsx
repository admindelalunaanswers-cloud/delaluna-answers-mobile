
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { UserDoc } from '@/src/types/user.type';

export default function ProfileScreen() {
    const PRONOUNS = ['She/Her', 'He/Him', 'They/Them', 'Non Binary'];
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [userRecord, setUserRecord] = useState<UserDoc | null>(null);
    return (
        <ThemedView style={styles.container}>
            <ThemedText type="title">Profile</ThemedText>
            <Ionicons name="person-circle-outline" size={64} color="#0a7ea4" />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
