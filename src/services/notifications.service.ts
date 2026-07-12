import { Platform } from 'react-native';

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';

import { db } from '@/firebaseConfig';

const EXPO_PROJECT_ID = 'a267fc5e-e587-4e94-b9ab-1cddd6decb94';

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
  console.log('[push] existing permission status:', existingStatus);
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    finalStatus = status;
  }

  console.log('[push] final permission status:', finalStatus);
  if (finalStatus !== 'granted') return; // User declined — skip silently

  const token = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
  console.log('[push] token:', token.data);

  // Capture the device's current UTC offset so the daily-reminder Cloud Function can
  // send pushes at the user's local time. getTimezoneOffset() returns minutes WEST of
  // UTC; negate so we store minutes EAST (e.g. EST = -300, IST = +330). Refreshed on
  // every login so travel and DST shifts are picked up automatically.
  const timezoneOffsetMinutes = -new Date().getTimezoneOffset();

  await setDoc(
    doc(db, 'users', uid),
    { expoPushToken: token.data, timezoneOffsetMinutes },
    { merge: true },
  );
  console.log('[push] token saved to Firestore (offset', timezoneOffsetMinutes, 'min)');
}

// ─── Unregistration ──────────────────────────────────────────────────────────

/**
 * Removes the Expo push token from the user's Firestore doc.
 * Call on logout so the device stops receiving notifications for this account.
 */
export async function unregisterPushToken(uid: string): Promise<void> {
  try {
    const { deleteField } = await import('firebase/firestore');
    await setDoc(doc(db, 'users', uid), { expoPushToken: deleteField() }, { merge: true });
    console.log('[push] token removed from Firestore for user', uid);
  } catch (err) {
    console.error('[push] failed to remove token:', err);
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
