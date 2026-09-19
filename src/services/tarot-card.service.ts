// src/services/tarotCardDraw.service.ts

import { db } from "@/firebaseConfig";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { DailyCardPackSchema } from "../schemas/dailyCardPack.schema";
import {
  buildDailyCardPack,
  drawDailySpread,
  toLocalDateId,
} from "../utils/tarot-draw";

// The deck, the shuffle and the pack shape live in `@/src/utils/tarot-draw`,
// which imports no Firebase — that is what lets `scripts/regenerate-user.js`
// redraw stored packs through the same code path the app uses instead of
// keeping a second copy of the shuffle. Re-exported here so existing callers
// (`chat.service.ts`, the tests) keep importing from the service.
export {
  drawChatSpread,
  drawTarotSpread,
  toLocalDateId,
} from "../utils/tarot-draw";

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
