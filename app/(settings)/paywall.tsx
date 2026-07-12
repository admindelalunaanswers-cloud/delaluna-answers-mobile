import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useRevenueCat } from '@/src/context/revenuecat-context';

export default function PaywallScreen() {
  const { presentPaywall } = useRevenueCat();

  useEffect(() => {
    presentPaywall().finally(() => router.back());
  }, [presentPaywall]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A0B3B',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
