// 

import DelalunaContainer from "@/src/components/shared/delaluna-container.component";
import { ThemedText } from "@/src/components/themed-text";
import { StyleSheet, View, TextInput, TouchableOpacity, Text } from "react-native";

export default function UpdatePasswordScreen() {
    return (
        <DelalunaContainer style={styles.container}>
            <ThemedText style={styles.title}>Update Password</ThemedText>
            <ThemedText style={styles.description}>
                This feature is coming soon. Please check back later.
            </ThemedText>
        </DelalunaContainer>
    );
}
const styles = StyleSheet.create({
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
        },
        description: {
            fontSize: 16,
            marginBottom: 20,
            textAlign: 'center',
        },
    });