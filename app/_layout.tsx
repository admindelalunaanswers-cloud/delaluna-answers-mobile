import { type ReactNode, useEffect, useRef } from 'react';

import { AppState, type AppStateStatus, Image, ImageBackground, View } from 'react-native';
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
import { usePortraitLock } from '@/src/hooks/use-portrait-lock';
import { useTheme } from '@/src/hooks/use-theme';
import { UpdateRequiredScreen } from '@/src/components/update-required-screen';
import { logScreenView, screenLabelForPath, setUserId } from '@/src/services/analytics.service';
import {
  installGlobalErrorHandler,
  logBreadcrumb,
  setUserId as setCrashlyticsUserId,
} from '@/src/services/crashlytics.service';
import { logger } from '@/src/utils/logger';

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

  // Register push token only after email is verified — the breakdown Cloud
  // Function reads this token and would otherwise notify users still on the
  // verification screen.
  useEffect(() => {
    if (!authUser) return;
    // `authUser.emailVerified` (the Auth record / token claim) is the only
    // source of truth. `users/{uid}.isEmailVerified` is a display mirror that
    // goes stale after an email change, and Firestore rules gate on the claim
    // — trusting the mirror here would land unverified users in the app.
    if (!authUser.emailVerified) return;
    import('@/src/services/notifications.service')
      .then(({ registerForPushNotifications }) => registerForPushNotifications(authUser.uid))
      .catch(logger.catchAsync('push_register'));
  }, [authUser?.uid, authUser?.emailVerified]);

  // Navigate to the correct screen when a notification is tapped.
  // Server pushes that target a dynamic route (e.g. `/connection/[id]`) include
  // a `connectionId` data field that we substitute into the path here.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data ?? {};
      const screen = data.screen;
      if (!screen || !authUser) return;
      let path = String(screen);
      if (data.connectionId) path = path.replace('[id]', String(data.connectionId));
      if (path.includes('chat')) {
        require('@/src/stores/chat-store').ChatStore.setFromNotification(true);
      }
      router.push(path as any);
    });
    return () => sub.remove();
  }, [authUser?.uid]);

  // Silent rollover push arrives at local midnight — pre-generate today's
  // horoscope so it's ready by morning.
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
        logger.error('[push] rollover-horoscope handler failed', err, 'push_rollover_handler');
      }
    });
    return () => sub.remove();
  }, [authUser?.uid]);

  // Track app foreground/background transitions on the user doc so the
  // chat-reply push trigger can skip notifying users who are already in the
  // app. Resolution is rough (within ~1s of state change is fine).
  const lastActiveWriteRef = useRef(0);
  useEffect(() => {
    if (!authUser) return;
    const writeActive = async () => {
      const now = Date.now();
      // Throttle writes to once every 5s — AppState fires often on iOS.
      if (now - lastActiveWriteRef.current < 5_000) return;
      lastActiveWriteRef.current = now;
      try {
        const { doc: docRef, updateDoc, serverTimestamp } = await import('firebase/firestore');
        const { db } = await import('@/firebaseConfig');
        await updateDoc(docRef(db, 'users', authUser.uid), {
          lastActiveAt: serverTimestamp(),
        });
      } catch {
        // Best-effort; doc may not exist yet during sign-up flow.
      }
    };
    writeActive();
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') writeActive();
    });
    return () => sub.remove();
  }, [authUser?.uid]);

  useEffect(() => {
    if (userLoading) return;

    // Verification state comes from `authUser.emailVerified` only — see the
    // push-registration effect above for why the Firestore mirror isn't trusted.
    if (!authUser && !inAuth && !inStartup) {
      router.replace('/(startup)/welcome');
    } else if (authUser && !authUser.emailVerified && userDoc && !inAuth) {
      router.replace('/(auth)/verify-email');
    } else if (authUser && (inAuth || inStartup) && horoscopeReady && authUser.emailVerified) {
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

  return (
    <ThemedRoot>
      <Slot />
      {shouldHoldRender ? <SplashFallback /> : null}
    </ThemedRoot>
  );
}

// Mirrors the native expo-splash-screen config (white bg, centered logo at 200px)
// so Android doesn't flash its postSplashScreenTheme background between the
// native splash dismissing and the first route painting.
function SplashFallback() {
  return (
    <View
      pointerEvents="auto"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
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
  usePortraitLock();

  useEffect(() => {
    let cleanup = () => {};
    import('@/src/services/notifications.service')
      .then(({ setupNotificationHandlers }) => { cleanup = setupNotificationHandlers(); })
      .catch(logger.catchAsync('push_setup_handlers'));
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
