import { Platform } from 'react-native';

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { doc, updateDoc } from 'firebase/firestore';

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
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return; // User declined — skip silently

  const token = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });

  await updateDoc(doc(db, 'users', uid), { expoPushToken: token.data });
}

/**
 * Configures how notifications appear when the app is in the foreground.
 * Call once at app startup. Returns a cleanup function.
 */
export function setupNotificationHandlers(): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener(response => {
    // Deep-link data attached in the Cloud Function: { screen: '/(main)' }
    const screen = response.notification.request.content.data?.screen;
    if (screen) {
      // Expo Router handles deep links automatically via the scheme in app.config.js,
      // but if a manual push is needed the screen value is available here.
      console.log('[Notifications] User tapped notification, target screen:', screen);
    }
  });

  return () => responseSub.remove();
}
