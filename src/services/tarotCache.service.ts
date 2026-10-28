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
import { logger } from "@/src/utils/logger";

// ----------------------------
// 🔑 Cache Key Helpers
// ----------------------------
export function tarotDailyKey(userId: string) {
  return `tarot_daily_${userId}`;
}

export function tarotHistoryKey(userId: string) {
  return `tarot_history_${userId}`;
}

export function chatDrawRevealKey(userId: string) {
  return `tarot_chat_draw_revealed_${userId}`;
}

// ----------------------------
// 🧹 Clear all tarot cache for a user
// ----------------------------
export async function clearTarotCache(userId: string) {
  try {
    const keys = [
      tarotDailyKey(userId),
      tarotHistoryKey(userId),
      chatDrawRevealKey(userId),
    ];
    await AsyncStorage.multiRemove(keys);
  } catch (err) {
    logger.warn("⚠️ Failed to clear tarot cache:", err);
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
    logger.warn("⚠️ Failed to save daily tarot card to cache:", err);
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
      logger.warn("⚠️ Cached tarot card was invalid. Clearing.");
      await AsyncStorage.removeItem(key);
      return null;
    }

    return result.data;
  } catch (err) {
    logger.warn("⚠️ Failed to read tarot cache:", err);
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
    logger.warn("⚠️ Failed to update tarot history:", err);
  }
}

// ----------------------------
// 🃏 Chat draws that have been turned over
// ----------------------------
// A chat draw behaves like the daily spread: once the cards are face up they
// stay face up. The message document itself can't record it — Firestore rules
// deny client updates on `updayedChat` — so the ids of revealed draws live
// here, capped so the list can't grow without bound.

const MAX_REVEALED_DRAWS = 50;

export async function getRevealedChatDraws(userId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(chatDrawRevealKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch (err) {
    logger.warn("⚠️ Failed to read revealed chat draws:", err);
    return [];
  }
}

export async function markChatDrawRevealed(
  userId: string,
  messageId: string,
): Promise<void> {
  try {
    const existing = await getRevealedChatDraws(userId);
    if (existing.includes(messageId)) return;
    const next = [messageId, ...existing].slice(0, MAX_REVEALED_DRAWS);
    await AsyncStorage.setItem(chatDrawRevealKey(userId), JSON.stringify(next));
  } catch (err) {
    logger.warn("⚠️ Failed to record a revealed chat draw:", err);
  }
}
