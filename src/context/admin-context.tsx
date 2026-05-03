/**
 * admin-context.tsx
 * Holds dev/admin-overridable runtime limits (chat & connection caps).
 * Values are persisted to AsyncStorage so changes survive a reload.
 *
 * Defaults match the production rules in the subscription spec:
 *   - dailyChatLimit:          1
 *   - freeConnectionLimit:     3
 *   - premiumConnectionLimit: 10
 */

import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  // Native module not available — context will operate in-memory only.
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_DAILY_CHAT_LIMIT = 1;
export const DEFAULT_FREE_CONNECTION_LIMIT = 3;
export const DEFAULT_PREMIUM_CONNECTION_LIMIT = 10;

const STORAGE_KEY = 'admin.limits.v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminLimits {
  dailyChatLimit: number;
  freeConnectionLimit: number;
  premiumConnectionLimit: number;
}

interface AdminContextValue extends AdminLimits {
  setDailyChatLimit: (n: number) => void;
  setFreeConnectionLimit: (n: number) => void;
  setPremiumConnectionLimit: (n: number) => void;
  resetToDefaults: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AdminContext = createContext<AdminContextValue>({
  dailyChatLimit: DEFAULT_DAILY_CHAT_LIMIT,
  freeConnectionLimit: DEFAULT_FREE_CONNECTION_LIMIT,
  premiumConnectionLimit: DEFAULT_PREMIUM_CONNECTION_LIMIT,
  setDailyChatLimit: () => {},
  setFreeConnectionLimit: () => {},
  setPremiumConnectionLimit: () => {},
  resetToDefaults: () => {},
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clampNonNegative(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

async function safeGet(): Promise<Partial<AdminLimits> | null> {
  if (!AsyncStorage) return null;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function safeSet(value: AdminLimits): Promise<void> {
  if (!AsyncStorage) return;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore — fall back to in-memory state
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AdminProvider({ children }: { children: ReactNode }) {
  const [dailyChatLimit, setDailyChatLimitState] = useState(DEFAULT_DAILY_CHAT_LIMIT);
  const [freeConnectionLimit, setFreeConnectionLimitState] = useState(DEFAULT_FREE_CONNECTION_LIMIT);
  const [premiumConnectionLimit, setPremiumConnectionLimitState] = useState(DEFAULT_PREMIUM_CONNECTION_LIMIT);

  // Hydrate from AsyncStorage once on mount
  useEffect(() => {
    let cancelled = false;
    safeGet().then((stored) => {
      if (cancelled || !stored) return;
      if (typeof stored.dailyChatLimit === 'number') {
        setDailyChatLimitState(clampNonNegative(stored.dailyChatLimit));
      }
      if (typeof stored.freeConnectionLimit === 'number') {
        setFreeConnectionLimitState(clampNonNegative(stored.freeConnectionLimit));
      }
      if (typeof stored.premiumConnectionLimit === 'number') {
        setPremiumConnectionLimitState(clampNonNegative(stored.premiumConnectionLimit));
      }
    });
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback((next: AdminLimits) => {
    void safeSet(next);
  }, []);

  const setDailyChatLimit = useCallback((n: number) => {
    const v = clampNonNegative(n);
    setDailyChatLimitState(v);
    persist({ dailyChatLimit: v, freeConnectionLimit, premiumConnectionLimit });
  }, [freeConnectionLimit, premiumConnectionLimit, persist]);

  const setFreeConnectionLimit = useCallback((n: number) => {
    const v = clampNonNegative(n);
    setFreeConnectionLimitState(v);
    persist({ dailyChatLimit, freeConnectionLimit: v, premiumConnectionLimit });
  }, [dailyChatLimit, premiumConnectionLimit, persist]);

  const setPremiumConnectionLimit = useCallback((n: number) => {
    const v = clampNonNegative(n);
    setPremiumConnectionLimitState(v);
    persist({ dailyChatLimit, freeConnectionLimit, premiumConnectionLimit: v });
  }, [dailyChatLimit, freeConnectionLimit, persist]);

  const resetToDefaults = useCallback(() => {
    setDailyChatLimitState(DEFAULT_DAILY_CHAT_LIMIT);
    setFreeConnectionLimitState(DEFAULT_FREE_CONNECTION_LIMIT);
    setPremiumConnectionLimitState(DEFAULT_PREMIUM_CONNECTION_LIMIT);
    persist({
      dailyChatLimit: DEFAULT_DAILY_CHAT_LIMIT,
      freeConnectionLimit: DEFAULT_FREE_CONNECTION_LIMIT,
      premiumConnectionLimit: DEFAULT_PREMIUM_CONNECTION_LIMIT,
    });
  }, [persist]);

  return (
    <AdminContext.Provider
      value={{
        dailyChatLimit,
        freeConnectionLimit,
        premiumConnectionLimit,
        setDailyChatLimit,
        setFreeConnectionLimit,
        setPremiumConnectionLimit,
        resetToDefaults,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAdmin() {
  return useContext(AdminContext);
}
