import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { STORE_LINKS } from '@/src/constants/links';

type Props = {
  storeUrl: string | null;
  installedVersion: string;
};

// Named for the platform's own store — this said "App Store" on Android too.
const STORE_NAME = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';
const STORE = Platform.OS === 'ios' ? STORE_LINKS.ios : STORE_LINKS.android;

export function UpdateRequiredScreen({ storeUrl, installedVersion }: Props) {
  // The min-version config can carry a store URL; when it doesn't, this screen
  // used to show no button at all, stranding everyone on the old build.
  const target = storeUrl ?? STORE.listing;

  const onPress = async () => {
    try {
      await Linking.openURL(target);
    } catch {
      try {
        await Linking.openURL(STORE.web);
      } catch {
        // Swallowed before, so a failure looked like the button doing nothing.
        Alert.alert('Update required', `Please update Delaluna Answers from ${STORE_NAME}.`);
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">Update required</Text>
      <Text style={styles.body}>
        This version of Delaluna Answers is no longer supported. Please update
        to continue.
      </Text>
      <Text style={styles.version}>You have v{installedVersion}</Text>

      <Pressable style={styles.button} onPress={onPress} accessibilityRole="button">
        <Text style={styles.buttonText}>Open {STORE_NAME}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1a',
    paddingHorizontal: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#a78bfa',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  body: {
    color: '#e6e9f0',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 12,
  },
  version: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#a78bfa',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 999,
  },
  buttonText: {
    color: '#0d0d1a',
    fontSize: 16,
    fontWeight: '600',
  },
});
