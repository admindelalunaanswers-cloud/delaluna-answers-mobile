import { StyleSheet } from 'react-native';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { Ionicons } from '@expo/vector-icons';

export default function ChatScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Chat</ThemedText>
      <Ionicons name="lock-closed-outline" size={64} color="#0a7ea4" />
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
