import { Platform } from 'react-native';

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';

import { db } from '@/firebaseConfig';

const EXPO_PROJECT_ID = 'a267fc5e-e587-4e94-b9ab-1cddd6decb94';

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

/**
 * Fires an immediate local notification telling the user their birth chart
 * breakdown is ready. Safe to call on any platform.
 */
export async function scheduleBreakdownReadyNotification(): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your Birth Chart is Ready ✨',
        body: 'Your natal chart breakdown has been read. Tap to explore your cosmic blueprint.',
        data: { screen: '/(home)/birth-chart-view' },
      },
      trigger: null, // deliver immediately
    });
  } catch {
    // Notifications not available (simulator, permission denied, etc.) — skip silently
  }
}

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
