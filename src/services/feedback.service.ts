import { httpsCallable } from 'firebase/functions';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import { functions } from '@/firebaseConfig';

export type FeedbackInput = {
  rating: number;
  loved: string[];
  improve: string[];
  comment: string;
  allowFollowUp: boolean;
};

/**
 * Sends in-app feedback to the `submitFeedback` Cloud Function, which saves it
 * to `feedback/{id}` and emails it to the admin inbox. Only the server writes
 * that collection; it also reads the contact address itself, and only when
 * `allowFollowUp` is true.
 *
 * Throws on failure (validation, throttling, network), so the screen can say so
 * rather than thank the user for feedback that never arrived.
 */
export async function submitFeedback(input: FeedbackInput): Promise<void> {
  await httpsCallable(functions, 'submitFeedback')({
    ...input,
    appVersion: Constants.expoConfig?.version ?? undefined,
    platform: `${Platform.OS} ${Platform.Version}`,
  });
}
