/**
 * use-trial-ending-alert.ts
 * Shows an Alert on the last 2 days of the 5-day free trial
 * (day 4 and day 5) prompting the user to upgrade.
 *
 * Dedupes by user uid + day index so the user sees the alert at most
 * once per day per device.
 */

import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

import { useUser } from '@/src/context/user-context';
import { useFreeTrialAccess, TRIAL_DURATION_DAYS } from '@/src/hooks/use-free-trial-access';
import { useRevenueCat } from '@/src/context/revenuecat-context';

const STORAGE_PREFIX = '@delaluna/trialEndingAlert';
const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(uid: string, dayIndex: number) {
  return `${STORAGE_PREFIX}/${uid}/${dayIndex}`;
}

async function safeGet(key: string): Promise<string | null> {
  try { return await AsyncStorage.getItem(key); } catch { return null; }
}

async function safeSet(key: string, value: string): Promise<void> {
  try { await AsyncStorage.setItem(key, value); } catch {}
}

export function useTrialEndingAlert(): void {
  const { authUser } = useUser();
  const { isPro } = useRevenueCat();
  const { inTrial, msRemaining } = useFreeTrialAccess();
  const shownThisSessionRef = useRef(false);

  useEffect(() => {
    if (shownThisSessionRef.current) return;
    if (isPro) return;
    if (!inTrial) return;
    if (!authUser?.uid) return;

    // Day index: 1 = first day of trial, 5 = last day (TRIAL_DURATION_DAYS)
    const daysRemaining = Math.ceil(msRemaining / DAY_MS);
    const dayIndex = TRIAL_DURATION_DAYS - daysRemaining + 1;

    // Only nudge on the last 2 days of the trial.
    if (dayIndex < TRIAL_DURATION_DAYS - 1) return;

    let cancelled = false;
    (async () => {
      const key = dayKey(authUser.uid, dayIndex);
      const seen = await safeGet(key);
      if (seen || cancelled) return;
      shownThisSessionRef.current = true;
      await safeSet(key, String(Date.now()));

      const isLastDay = daysRemaining <= 1;
      const title = isLastDay ? 'Your free trial ends today' : 'Your free trial is ending soon';
      const message = isLastDay
        ? 'This is the last day of your premium trial. Upgrade now to keep ad-free access, full readings, and connections.'
        : `Only ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left in your free trial. Upgrade to keep premium access when it ends.`;

      Alert.alert(title, message, [
        { text: 'Maybe later', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/(settings)/paywall') },
      ]);
    })();

    return () => { cancelled = true; };
  }, [authUser?.uid, isPro, inTrial, msRemaining]);
}
