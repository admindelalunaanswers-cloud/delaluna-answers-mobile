/**
 * paywall.tsx
 * Full-screen RevenueCat paywall presented as a routable screen.
 * Navigating here shows the paywall configured in the RevenueCat dashboard.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';

import { router } from 'expo-router';
import RevenueCatUI from 'react-native-purchases-ui';

import { useRevenueCat } from '@/src/context/revenuecat-context';

export default function PaywallScreen() {
  const { refresh } = useRevenueCat();

  return (
    <View style={styles.container}>
      <RevenueCatUI.Paywall
        onPurchaseCompleted={async () => {
          await refresh();
          router.back();
        }}
        onRestoreCompleted={async () => {
          await refresh();
          router.back();
        }}
        onDismiss={() => {
          router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A061E',
  },
});
