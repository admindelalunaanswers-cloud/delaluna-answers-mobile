import { type ReactNode, useEffect } from 'react';

import { ImageBackground } from 'react-native';

import { Slot, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

import ThemeProvider from '@/src/context/theme-context';
import { HoroscopeProvider, useHoroscope } from '@/src/context/horoscope-context';
import { UserProvider, useUser } from '@/src/context/user-context';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { useTheme } from '@/src/hooks/use-theme';
import { registerForPushNotifications, setupNotificationHandlers } from '@/src/services/notifications.service';
import LoadingScreen from './(util)/loading-screen';

function AuthGate({ children }: { children: ReactNode }) {
  const { authUser, loading: userLoading } = useUser();
  const { loading: dataLoading } = useHoroscope();
  const router = useRouter();
  const segments = useSegments();

  // Register push token once the user is signed in
  useEffect(() => {
    if (!authUser) return;
    registerForPushNotifications(authUser.uid).catch(console.error);
  }, [authUser?.uid]);

  useEffect(() => {
    if (userLoading) return;
    const inAuth = segments[0] === '(auth)';
    const inStartup = segments[0] === '(startup)';

    if (!authUser && !inAuth && !inStartup) {
      router.replace('/(startup)/welcome');
    } else if (authUser && (inAuth || inStartup)) {
      router.replace('/(main)');
    }
  }, [authUser, userLoading, segments]);

  const inAuth = segments[0] === '(auth)';
  const inStartup = segments[0] === '(startup)';

  const isRedirecting =
    !userLoading &&
    (
      (!authUser && !inAuth && !inStartup) ||
      (!!authUser && (inAuth || inStartup))
    );

  // Wait for auth + data (when signed in) before showing any screen
  const showLoading = userLoading || (!!authUser && dataLoading) || isRedirecting;

  if (showLoading) {
    return <LoadingScreen message="Loading..." />;
  }

  return <>{children}</>;
}

function ThemedRoot({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();
  const { theme } = useTheme();

  return (
    <ImageBackground
      source={theme.backgroundImage}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {children}
        <StatusBar style="auto" />
      </NavThemeProvider>
    </ImageBackground>
  );
}

export default function RootLayout() {
  useEffect(() => {
    const cleanup = setupNotificationHandlers();
    return cleanup;
  }, []);

  return (
    <SafeAreaProvider>
      <UserProvider>
        <ThemeProvider>
          <ThemedRoot>
            <HoroscopeProvider>
              <AuthGate>
                <Slot />
              </AuthGate>
            </HoroscopeProvider>
          </ThemedRoot>
        </ThemeProvider>
      </UserProvider>
    </SafeAreaProvider>
  );
}
