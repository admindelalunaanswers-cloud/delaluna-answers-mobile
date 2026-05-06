import { type ReactNode, useEffect } from 'react';

import { Image, ImageBackground, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';

import { Slot, usePathname, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

// Keep the native splash visible until AuthGate decides what to render.
SplashScreen.preventAutoHideAsync().catch(() => {});

import ThemeProvider from '@/src/context/theme-context';
import { HoroscopeProvider, useHoroscope } from '@/src/context/horoscope-context';
import { UserProvider, useUser } from '@/src/context/user-context';
import { RevenueCatProvider } from '@/src/context/revenuecat-context';
import { AdminProvider } from '@/src/context/admin-context';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { useMinVersion } from '@/src/hooks/use-min-version';
import { useTheme } from '@/src/hooks/use-theme';
import { UpdateRequiredScreen } from '@/src/components/update-required-screen';
import { logScreenView, screenLabelForPath, setUserId } from '@/src/services/analytics.service';
import {
  installGlobalErrorHandler,
  logBreadcrumb,
  setUserId as setCrashlyticsUserId,
} from '@/src/services/crashlytics.service';

function AuthGate() {
  const { authUser, userDoc, loading: userLoading } = useUser();
  const { loading: dataLoading, horoscope, horoscopeGenerating, transitReadingGenerating } = useHoroscope();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();

  const inAuth    = segments[0] === '(auth)';
  const inStartup = segments[0] === '(startup)';

  // Attach Firebase Auth UID to GA4 user_id and Crashlytics user;
  // clear on sign-out.
  useEffect(() => {
    setUserId(authUser?.uid ?? null);
    setCrashlyticsUserId(authUser?.uid ?? null);
  }, [authUser?.uid]);

  // Log a screen_view on every route change with a human-friendly name.
  // screen_class keeps the raw pathname for debugging in GA4. Also drop a
  // Crashlytics breadcrumb so crash reports show the user's last screens.
  useEffect(() => {
    if (!pathname) return;
    const label = screenLabelForPath(pathname);
    logScreenView(label, pathname);
    logBreadcrumb(`screen: ${label}`);
  }, [pathname]);

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

  // Silent rollover push: the dailyHoroscopeNotifications scheduled function
  // sends a content-available data push at user local midnight. When it
  // arrives (foreground or briefly-woken background), pre-generate today's
  // horoscope so it's ready by morning. Best-effort — iOS throttles silent
  // pushes and may skip delivery if the app is force-killed.
  useEffect(() => {
    if (!authUser) return;
    const sub = Notifications.addNotificationReceivedListener(async notification => {
      const action = notification.request.content.data?.action;
      if (action !== 'rollover-horoscope') return;
      try {
        const { doc: docRef, getDoc } = await import('firebase/firestore');
        const { db } = await import('@/firebaseConfig');
        const { rolloverHoroscope } = await import('@/src/services/horoscope.service');

        const chartSnap = await getDoc(docRef(db, 'users', authUser.uid, 'natalChart', 'details'));
        if (!chartSnap.exists()) return;
        const userSnap = await getDoc(docRef(db, 'users', authUser.uid));
        const pronouns = userSnap.data()?.pronouns ?? 'they/them';
        await rolloverHoroscope(authUser.uid, chartSnap.data() as any, pronouns);
      } catch (err) {
        console.error('[push] rollover-horoscope handler failed:', err);
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

  // Hold rendering until auth state is known, or while we're about to redirect
  // a signed-out user out of (main). Prevents the home screen from flashing
  // before the redirect effect runs.
  const shouldHoldRender =
    userLoading ||
    authUser === undefined ||
    (!authUser && !inAuth && !inStartup);

  // Hide the native splash only once we're ready to render the real route.
  useEffect(() => {
    if (!shouldHoldRender) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [shouldHoldRender]);

  if (shouldHoldRender) {
    return <SplashFallback />;
  }

  return (
    <ThemedRoot>
      <Slot />
    </ThemedRoot>
  );
}

// Mirrors the native expo-splash-screen config (white bg, centered logo at 200px)
// so Android doesn't flash its postSplashScreenTheme background between the
// native splash dismissing and the first route painting.
function SplashFallback() {
  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={require('@/src/assets/dlla-branded/delaluna_app_icon.png')}
        style={{ width: 200, height: 200 }}
        resizeMode="contain"
      />
    </View>
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

// Install once at module load so it covers errors that fire before the first
// render (e.g. during context provider setup).
installGlobalErrorHandler();

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
