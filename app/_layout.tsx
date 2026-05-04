import { type ReactNode, useEffect } from 'react';

import { ImageBackground } from 'react-native';
import * as Notifications from 'expo-notifications';

import { Slot, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

import ThemeProvider from '@/src/context/theme-context';
import { HoroscopeProvider, useHoroscope } from '@/src/context/horoscope-context';
import { UserProvider, useUser } from '@/src/context/user-context';
import { RevenueCatProvider } from '@/src/context/revenuecat-context';
import { AdminProvider } from '@/src/context/admin-context';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { useMinVersion } from '@/src/hooks/use-min-version';
import { useTheme } from '@/src/hooks/use-theme';
import { UpdateRequiredScreen } from '@/src/components/update-required-screen';

function AuthGate() {
  const { authUser, userDoc, loading: userLoading } = useUser();
  const { loading: dataLoading, horoscope, horoscopeGenerating, transitReadingGenerating } = useHoroscope();
  const router = useRouter();
  const segments = useSegments();

  const inAuth    = segments[0] === '(auth)';
  const inStartup = segments[0] === '(startup)';

  // Don't redirect from auth/startup → main until horoscope and transit reading
  // are available. This prevents screens rendering empty while extensions generate.
  const horoscopeReady =
    (!!horoscope || (!dataLoading && !horoscopeGenerating)) &&
    !transitReadingGenerating;

  // Register push token once the user is signed in
  useEffect(() => {
    if (!authUser) return;
    import('@/src/services/notifications.service')
      .then(({ registerForPushNotifications }) => registerForPushNotifications(authUser.uid))
      .catch(console.error);
  }, [authUser?.uid]);

  // Navigate to the correct screen when a notification is tapped
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const screen = response.notification.request.content.data?.screen;
      if (screen && authUser) {
        if (String(screen).includes('chat')) {
          require('@/src/stores/chat-store').ChatStore.setFromNotification(true);
        }
        router.push(screen as any);
      }
    });
    return () => sub.remove();
  }, [authUser?.uid]);

  useEffect(() => {
    if (userLoading) return;

    if (!authUser && !inAuth && !inStartup) {
      router.replace('/(startup)/welcome');
    } else if (authUser && !authUser.emailVerified && userDoc && !userDoc.isEmailVerified && !inAuth) {
      router.replace('/(auth)/verify-email');
    } else if (authUser && (inAuth || inStartup) && horoscopeReady && (userDoc?.isEmailVerified === true || authUser.emailVerified)) {
      router.replace('/(main)');
    }
  }, [authUser, userDoc, userLoading, inAuth, inStartup, horoscopeReady]);

  return (
    <ThemedRoot>
      <Slot />
    </ThemedRoot>
  );
}

function ThemedRoot({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();
  const { theme } = useTheme();
  const segments = useSegments();
  const isMain = segments[0] !== '(auth)' && segments[0] !== '(startup)';

  const inner = (
    <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {children}
      <StatusBar style="auto" />
    </NavThemeProvider>
  );

  if (!isMain) {
    return <>{inner}</>;
  }

  return (
    <ImageBackground
      source={theme.backgroundImage}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      {inner}
    </ImageBackground>
  );
}

function VersionGate({ children }: { children: ReactNode }) {
  const { status, storeUrl, installedVersion } = useMinVersion();
  if (status === 'update-required') {
    return (
      <UpdateRequiredScreen
        storeUrl={storeUrl}
        installedVersion={installedVersion}
      />
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  useEffect(() => {
    let cleanup = () => {};
    import('@/src/services/notifications.service')
      .then(({ setupNotificationHandlers }) => { cleanup = setupNotificationHandlers(); })
      .catch(console.error);
    return () => cleanup();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <VersionGate>
          <UserProvider>
            <RevenueCatProvider>
              <AdminProvider>
                <ThemeProvider>
                  <HoroscopeProvider>
                    <AuthGate />
                  </HoroscopeProvider>
                </ThemeProvider>
              </AdminProvider>
            </RevenueCatProvider>
          </UserProvider>
        </VersionGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
