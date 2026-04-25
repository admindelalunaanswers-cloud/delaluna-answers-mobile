// src/services/tarotCardDraw.service.ts

import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { TAROT_CARDS } from "../constants/tarotCards.registry";
import { DailyCardPack } from "../models/daily-cards.model";
import { DrawnTarotCard } from "../types/tarot-cards.type";
import { DailyCardPackSchema } from "../schemas/dailyCardPack.schema";
import { DrawnTarotCardSchema } from "../schemas/drawnTarotCard.schema";


function createSeededRng(seed: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return function () {
    // Mulberry32
    h += 0x6D2B79F5;
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

function drawDailySpread(userId: string, date: string, count: number): DrawnTarotCard[] {
  const seed = `${userId}_${date}`;
  const shuffledDeck = shuffleDeck(TAROT_CARDS, seed);
  const rand = createSeededRng(seed + "_rev");

  return shuffledDeck.slice(0, count).map(card => {
    const reversed = rand() < (card.reversalProbability ?? 0.35);

    return DrawnTarotCardSchema.parse({
      id: card.id,
      name: card.name,
      imagePath: card.imagePath,
      reversed,
      keywords: reversed ? card.keywordsReversed : card.keywordsUpright,
      meaning: card.arcana !== 'Oracle'
        ? (reversed ? (card.meaningReversedOracle ?? card.meaningReversed) : (card.meaningUprightOracle ?? card.meaningUpright))
        : (reversed ? card.meaningReversed : card.meaningUpright),
    });
  });
}

function buildTarotJSON(cards: DrawnTarotCard[]): string {
  return JSON.stringify(
    cards.map(c => ({
      name: c.name,
      reversed: c.reversed,
      keywords: c.keywords,
      meaning: c.meaning
    })),
    null,
    2
  );
}

function buildDailyCardPack(date: string, cards: DrawnTarotCard[]): DailyCardPack {
  const keywordList = cards.flatMap(c => c.keywords);
  const keywordString = keywordList.join(", ");
  const meaningString = cards.map(c => c.meaning).join(" ");

  const reversedCount = cards.filter(c => c.reversed).length;
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
    createdAt: null,  // placeholder — overridden with serverTimestamp() on write
    firstView: false,
  });
}

async function getOrCreateCardsForDate(
  userId: string,
  date: string,
  count: number
) {
  const db = getFirestore();

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

function localDateId(offsetDays: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getTarotCardDraw(userId: string, cardDrawCount: number = 1) {
  const yesterday = localDateId(-1);
  const today = localDateId(0);
  const tomorrow = localDateId(1);

  return {
    yesterday: await getOrCreateCardsForDate(userId, yesterday, cardDrawCount),
    today: await getOrCreateCardsForDate(userId, today, cardDrawCount),
    tomorrow: await getOrCreateCardsForDate(userId, tomorrow, cardDrawCount),
  };
}