import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  storeUrl: string | null;
  installedVersion: string;
};

export function UpdateRequiredScreen({ storeUrl, installedVersion }: Props) {
  const onPress = () => {
    if (storeUrl) Linking.openURL(storeUrl).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Update required</Text>
      <Text style={styles.body}>
        This version of Delaluna Answers is no longer supported. Please update
        to continue.
      </Text>
      <Text style={styles.version}>You have v{installedVersion}</Text>

      {storeUrl ? (
        <Pressable style={styles.button} onPress={onPress}>
          <Text style={styles.buttonText}>Open the App Store</Text>
        </Pressable>
      ) : null}
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
