/**
 * Where card art lives, and how a card id becomes a URL for it.
 *
 * The art sits under `cards/` in Storage, split by deck:
 * `cards/oracle/{id}.png` for the 53 oracle cards, `cards/tarot/{id}.png` for
 * the 78 tarot cards.
 *
 * The folder is derived from the id here rather than read off a card's stored
 * `imagePath`. That field is snapshotted into the daily pack at
 * `users/{uid}/cards/{date}`, so packs written before the move still carry a
 * bare `1.png` — deriving the folder means those keep resolving with no
 * migration and no per-document fallback.
 *
 * Ids 1–53 are the oracle deck. The same split picks the card back, so both
 * live here instead of being spelled out in each component.
 */

import Constants from "expo-constants";

/** Highest id belonging to the oracle deck; everything above it is tarot. */
export const ORACLE_MAX_ID = 53;

export function isOracleCard(id: number): boolean {
  return id <= ORACLE_MAX_ID;
}

// The same bucket the JS SDK is initialised with (`firebaseConfig.ts`), so card
// art follows APP_ENV instead of being pinned to one project. These are plain
// download URLs rather than SDK calls, so the bucket has to be named here too —
// reading it from the same place is what keeps the two from drifting apart.
const BUCKET =
  (Constants.expoConfig?.extra?.FIREBASE_STORAGE_BUCKET as string | undefined) ??
  "delaluna-answers.firebasestorage.app";

export function tarotCardImageUrl(id: number): string {
  const path = `cards/${isOracleCard(id) ? "oracle" : "tarot"}/${id}.png`;
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
}

/**
 * Screen-reader name for one card in a spread. The faces are images, so this is
 * the only way a VoiceOver / TalkBack user learns what was drawn.
 */
export function tarotCardLabel(
  name: string | undefined,
  isReversed: boolean,
  revealed: boolean,
  index: number,
): string {
  if (!revealed) return `Card ${index + 1}, face down`;
  const base = name ?? `Card ${index + 1}`;
  return isReversed ? `${base}, reversed` : base;
}
