// src/services/tarotCache.service.ts

/**
 * tarotCache.service.ts
 * Centralized cache utilities for tarot-related data.
 *
 * This module provides:
 *  - Caching & retrieving daily tarot cards
 *  - Cache invalidation helpers
 *  - Namespaced cache keys for consistency
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { DailyTarotSchema } from "../schemas/dailyTarot.schema";

// ----------------------------
// 🔑 Cache Key Helpers
// ----------------------------
export function tarotDailyKey(userId: string) {
  return `tarot_daily_${userId}`;
}

export function tarotHistoryKey(userId: string) {
  return `tarot_history_${userId}`;
}

// ----------------------------
// 🧹 Clear all tarot cache for a user
// ----------------------------
export async function clearTarotCache(userId: string) {
  try {
    const keys = [tarotDailyKey(userId), tarotHistoryKey(userId)];
    await AsyncStorage.multiRemove(keys);
    console.log("⚠️ Cleared tarot cache for", userId);
  } catch (err) {
    console.warn("⚠️ Failed to clear tarot cache:", err);
  }
}

// ----------------------------
// 💾 Save Daily Card to Cache
// ----------------------------
export async function saveDailyCardToCache(
  userId: string,
  card: z.infer<typeof DailyTarotSchema>
) {
  try {
    const key = tarotDailyKey(userId);
    await AsyncStorage.setItem(key, JSON.stringify(card));
  } catch (err) {
    console.warn("⚠️ Failed to save daily tarot card to cache:", err);
  }
}

// ----------------------------
// 📦 Load Daily Card From Cache
// ----------------------------
export async function getDailyCardFromCache(
  userId: string
): Promise<z.infer<typeof DailyTarotSchema> | null> {
  try {
    const key = tarotDailyKey(userId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const result = DailyTarotSchema.safeParse(parsed);

    if (!result.success) {
      console.warn("⚠️ Cached tarot card was invalid. Clearing.");
      await AsyncStorage.removeItem(key);
      return null;
    }

    return result.data;
  } catch (err) {
    console.warn("⚠️ Failed to read tarot cache:", err);
    return null;
  }
}

// ----------------------------
// 📜 Tarot History (Optional future feature)
// ----------------------------
export async function appendToTarotHistory(
  userId: string,
  entry: z.infer<typeof DailyTarotSchema>
) {
  try {
    const key = tarotHistoryKey(userId);
    const raw = await AsyncStorage.getItem(key);
    let history: any[] = [];

    if (raw) {
      try {
        history = JSON.parse(raw);
        if (!Array.isArray(history)) history = [];
      } catch {
        history = [];
      }
    }

    history.unshift(entry);
    await AsyncStorage.setItem(key, JSON.stringify(history));
  } catch (err) {
    console.warn("⚠️ Failed to update tarot history:", err);
  }
}