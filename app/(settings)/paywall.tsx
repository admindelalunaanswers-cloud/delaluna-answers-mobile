import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useRevenueCat } from '@/src/context/revenuecat-context';

export default function PaywallScreen() {
  const { presentPaywall } = useRevenueCat();

  // `presentPaywall` is NOT a stable reference: closing the paywall runs
  // `refresh()`, which sets a new `customerInfo`, which rebuilds
  // `resolveOffering` and with it `presentPaywall`. Depending on it here made
  // the effect re-run on dismissal — presenting a second native paywall on top
  // of the screen we were already popping, and calling `router.back()` twice.
  // Present exactly once per mount instead.
  const presentedRef = useRef(false);

  useEffect(() => {
    if (presentedRef.current) return;
    presentedRef.current = true;

    let cancelled = false;
    presentPaywall().finally(() => {
      if (cancelled) return;
      // This route is also reachable from a notification deep link, where
      // there is no history to pop — `back()` would throw there.
      if (router.canGoBack()) router.back();
      else router.replace('/(main)');
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
