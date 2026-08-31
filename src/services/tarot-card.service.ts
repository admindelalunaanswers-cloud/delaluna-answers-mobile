// src/services/tarotCardDraw.service.ts

import { db } from "@/firebaseConfig";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { TAROT_CARDS } from "../constants/tarotCards.registry";
import { DailyCardPack } from "../models/daily-cards.model";
import { DailyCardPackSchema } from "../schemas/dailyCardPack.schema";
import { DrawnTarotCardSchema } from "../schemas/drawnTarotCard.schema";
import { DrawnTarotCard } from "../types/tarot-cards.type";

function createSeededRng(seed: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return function () {
    // Mulberry32
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeck<T>(deck: T[], seed: string): T[] {
  const shuffled = [...deck];
  const rand = createSeededRng(seed);

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Draws `count` cards for an arbitrary seed.
 *
 * This is the one place the deck is shuffled and orientations are rolled —
 * the daily horoscope spread and the tarot chat both go through it, so they
 * share a deck, a shuffle, and the per-card reversal probabilities. Only the
 * seed differs: the daily draw seeds on user + date so the cards hold for the
 * day, the chat seeds on the question so each one gets its own pull.
 *
 * Deterministic: the same seed always yields the same cards.
 */
export function drawTarotSpread(seed: string, count: number): DrawnTarotCard[] {
  const shuffledDeck = shuffleDeck(TAROT_CARDS, seed);
  const rand = createSeededRng(seed + "_rev");

  return shuffledDeck.slice(0, count).map((card) => {
    const reversed = rand() < (card.reversalProbability ?? 0.35);

    return DrawnTarotCardSchema.parse({
      id: card.id,
      name: card.name,
      imagePath: card.imagePath,
      reversed,
      keywords: reversed ? card.keywordsReversed : card.keywordsUpright,
      meaning:
        card.arcana !== "Oracle"
          ? reversed
            ? (card.meaningReversedOracle ?? card.meaningReversed)
            : (card.meaningUprightOracle ?? card.meaningUpright)
          : reversed
            ? card.meaningReversed
            : card.meaningUpright,
    });
  });
}

/** The daily spread: seeded on user + date, so it holds for the whole day. */
function drawDailySpread(
  userId: string,
  date: string,
  count: number,
): DrawnTarotCard[] {
  return drawTarotSpread(`${userId}_${date}`, count);
}

/**
 * The spread for one tarot chat question.
 *
 * Seeded on the question itself, so a distinct question gets a distinct pull
 * while re-sending the same question — which is what a retry is — pulls the
 * same card back. `ordinal` keeps a user who asks the same thing twice in one
 * day from getting the same card twice.
 *
 * `drawnAt` is the instant the turn was composed — the message's `createdAt`,
 * not the current clock. The seed carries a local date, so reading the clock
 * here would make a conversation held across midnight recompute a different
 * card than the one the model was actually given.
 */
export function drawChatSpread(
  userId: string,
  question: string,
  ordinal: number,
  drawnAt: Date,
  count: number = 1,
): DrawnTarotCard[] {
  return drawTarotSpread(
    `${userId}_${toLocalDateId(drawnAt)}_${ordinal}_${question.trim().toLowerCase()}`,
    count,
  );
}

function buildTarotJSON(cards: DrawnTarotCard[]): string {
  return JSON.stringify(
    cards.map((c) => ({
      name: c.name,
      reversed: c.reversed,
      keywords: c.keywords,
      meaning: c.meaning,
    })),
    null,
    2,
  );
}

function buildDailyCardPack(
  date: string,
  cards: DrawnTarotCard[],
): DailyCardPack {
  const keywordList = cards.flatMap((c) => c.keywords);
  const keywordString = keywordList.join(", ");
  const meaningString = cards.map((c) => c.meaning).join(" ");

  const reversedCount = cards.filter((c) => c.reversed).length;
  const uprightCount = cards.length - reversedCount;

  return DailyCardPackSchema.parse({
    date,
    cards,
    keywordList,
    keywordString,
    meaningString,
    tarotJSON: buildTarotJSON(cards),
    reversedCount,
    uprightCount,
    createdAt: null, // placeholder — overridden with serverTimestamp() on write
    firstView: false,
  });
}

async function getOrCreateCardsForDate(
  userId: string,
  date: string,
  count: number,
) {
  // Use the local date as the document ID
  const cardsRef = doc(db, "users", userId, "cards", date);
  const cardsSnap = await getDoc(cardsRef);

  // If tarot already exists, return it
  if (cardsSnap.exists()) {
    return DailyCardPackSchema.parse(cardsSnap.data());
  }

  // Create daily tarot pack
  const cards = drawDailySpread(userId, date, count);
  const pack = buildDailyCardPack(date, cards);

  await setDoc(cardsRef, { ...pack, createdAt: serverTimestamp() });

  return pack;
}

/** `YYYY-MM-DD` for a given instant, in the device's local timezone. */
export function toLocalDateId(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localDateId(offsetDays: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return toLocalDateId(d);
}

export async function getTarotCardDraw(
  userId: string,
  cardDrawCount: number = 1,
) {
  const yesterday = localDateId(-1);
  const today = localDateId(0);
  const tomorrow = localDateId(1);

  return {
    yesterday: await getOrCreateCardsForDate(userId, yesterday, cardDrawCount),
    today: await getOrCreateCardsForDate(userId, today, cardDrawCount),
    tomorrow: await getOrCreateCardsForDate(userId, tomorrow, cardDrawCount),
  };
}
