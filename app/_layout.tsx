import { type ReactNode, useEffect } from 'react';

import { ImageBackground } from 'react-native';

import { Slot, useRouter, useSegments } from 'expo-router';

import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

import ThemeProvider from '@/src/context/theme-context';
import { UserProvider, useUser } from '@/src/context/user-context';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { useTheme } from '@/src/hooks/use-theme';
import LoadingScreen from './(util)/loading-screen';

function AuthGate({ children }: { children: ReactNode }) {
  const { authUser, loading } = useUser();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    const inStartup = segments[0] === '(startup)';
    if (!authUser && !inAuth && !inStartup) {
      router.replace('/(startup)/welcome');
    } else if (authUser && (inAuth || inStartup)) {
      router.replace('/(main)');
    }
  }, [authUser, loading, segments]);

  const inAuth = segments[0] === '(auth)';
  const inStartup = segments[0] === '(startup)';
  const isRedirecting =
    !loading &&
    ((!authUser && !inAuth && !inStartup) || (!!authUser && (inAuth || inStartup)));

  if (loading || isRedirecting) {
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
  return (
    <UserProvider>
      <ThemeProvider>
        <ThemedRoot>
          <AuthGate>
            <Slot />
          </AuthGate>
        </ThemedRoot>
      </ThemeProvider>
    </UserProvider>
  );
}
