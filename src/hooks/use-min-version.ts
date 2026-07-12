import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { doc, onSnapshot } from 'firebase/firestore';

import { db } from '../../firebaseConfig';

type Status = 'loading' | 'ok' | 'update-required';

type MinVersionDoc = {
  ios?: string;
  android?: string;
  storeUrlIos?: string;
  storeUrlAndroid?: string;
};

function parseSemver(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isBelow(installed: string, floor: string): boolean {
  const a = parseSemver(installed);
  const b = parseSemver(floor);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}

export function useMinVersion(): {
  status: Status;
  storeUrl: string | null;
  installedVersion: string;
} {
  const [status, setStatus] = useState<Status>('loading');
  const [storeUrl, setStoreUrl] = useState<string | null>(null);

  const installedVersion =
    (Constants.expoConfig?.version as string | undefined) ?? '0.0.0';

  useEffect(() => {
    const ref = doc(db, 'config', 'app');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.data() as MinVersionDoc | undefined) ?? {};
        const floor = Platform.OS === 'ios' ? data.ios : data.android;
        const url =
          Platform.OS === 'ios' ? data.storeUrlIos : data.storeUrlAndroid;
        if (floor && isBelow(installedVersion, floor)) {
          setStoreUrl(url ?? null);
          setStatus('update-required');
        } else {
          setStatus('ok');
        }
      },
      // Fail open: a Firestore read error must not lock users out.
      (err) => {
        console.warn('[useMinVersion] config read failed:', err);
        setStatus('ok');
      },
    );
    return () => unsub();
  }, [installedVersion]);

  return { status, storeUrl, installedVersion };
}
