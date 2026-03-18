import { Platform } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';

import { db } from '@/firebaseConfig';

const EXPO_PROJECT_ID = 'a267fc5e-e587-4e94-b9ab-1cddd6decb94';

// ─── Deduplication ────────────────────────────────────────────────────────────
// Module-level Set is the synchronous first-check — prevents concurrent calls
// (e.g. React Strict Mode double-invoke) from both passing before AsyncStorage
// is written. AsyncStorage handles cross-session persistence across app restarts.
const _sent = new Set<string>();

/**
 * Fires `scheduleFn` at most once per `key` per app session and per device.
 * Safe to call concurrently — the synchronous Set guard prevents races.
 */
export function notifyOnce(key: string, scheduleFn: () => Promise<void>): void {
  if (_sent.has(key)) return;
  _sent.add(key); // synchronous guard — blocks any concurrent call immediately

  AsyncStorage.getItem(key)
    .then(sent => {
      if (sent === 'true') return;
      return AsyncStorage.setItem(key, 'true').then(() => scheduleFn());
    })
    .catch(console.error);
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Requests permission and saves the Expo push token to the user's Firestore doc.
 * Safe to call on every login — skips silently on simulators or if permission denied.
 */
export async function registerForPushNotifications(uid: string): Promise<void> {
  if (!Device.isDevice) return; // Simulators can't receive push notifications

  // Android requires an explicit notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Delaluna Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#BCA8F4',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return; // User declined — skip silently

  const token = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });

  await setDoc(doc(db, 'users', uid), { expoPushToken: token.data }, { merge: true });
}

// ─── Schedule helpers ─────────────────────────────────────────────────────────

export async function scheduleBreakdownReadyNotification(): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your Birth Chart is Ready ✨',
        body: 'Your natal chart breakdown has been read. Tap to explore your cosmic blueprint.',
        data: { screen: '/(home)/birth-chart-view' },
      },
      trigger: Platform.OS === 'android' ? { channelId: 'default' } : null,
    });
  } catch {
    // Notifications not available (simulator, permission denied, etc.) — skip silently
  }
}

export async function scheduleHoroscopeReadyNotification(): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Today's Horoscope is Ready",
        body: 'Your daily cosmic reading is available. Tap to explore.',
        data: { screen: '/(main)' },
      },
      trigger: Platform.OS === 'android' ? { channelId: 'default' } : null,
    });
  } catch {
    // Notifications not available (simulator, permission denied, etc.) — skip silently
  }
}

export async function scheduleTransitReadyNotification(): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your Weekly Transit Reading is Ready',
        body: 'See how the planets are influencing your week. Tap to explore.',
        data: { screen: '/(main)/transits' },
      },
      trigger: Platform.OS === 'android' ? { channelId: 'default' } : null,
    });
  } catch {
    // Notifications not available (simulator, permission denied, etc.) — skip silently
  }
}

// ─── Foreground handler ───────────────────────────────────────────────────────

/**
 * Configures how notifications appear when the app is in the foreground.
 * Call once at app startup. Returns a cleanup function.
 */
export function setupNotificationHandlers(): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  return () => {};
}
