/**
 * quote-history.ts — keeps the daily horoscope quote from repeating.
 *
 * Every horoscope branches from the same per-user anchor (see anchor.ts), so a
 * generation never sees what the previous day produced, and Gemini 3 has no
 * `temperature` to push it off its most likely answer. Against a near-static
 * natal chart the "quote" field converged on the same few lines.
 *
 * The fix reuses what is already stored rather than keeping a separate history:
 * the horoscope documents on either side of the one being generated. The client
 * keeps roughly yesterday / today / tomorrow (`rolloverHoroscope` deletes the doc
 * from two days ago, `weeklyCleanup` catches the rest), so the window is small —
 * it stops back-to-back repeats, not a repeat from three weeks ago.
 *
 * The quotes are appended at generation time and never written back into the
 * stored `prompt`. That matters: `runAnchoredGeneration` hashes the stored
 * prompt to detect its own write-back, so mutating it would re-fire generation.
 *
 * Known gap: when yesterday, today and tomorrow are all requested at once (first
 * launch, or after a birth-data edit) they generate concurrently and none can see
 * the others. Steady state is fine — tomorrow is pre-generated a day ahead, by
 * which point today's quote exists.
 *
 * The daily topic/style rotation (`withQuoteDirection`) covers both weaknesses
 * of the history: it needs no stored data, so it works for that concurrent first
 * batch, and it keeps varying the input past the three-day window. The history
 * then catches the model landing on a near-identical line anyway.
 */

import * as admin from "firebase-admin";

/** How far either side of the target date to look for existing quotes. */
const WINDOW_DAYS = 3;

/** Offsets a YYYY-MM-DD id by whole days. Pure calendar arithmetic, in UTC. */
function offsetDateId(dateId: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateId);
  if (!match) return null;
  const d = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Pulls `quote` out of a stored horoscope response. Legacy extension documents
 * can hold a parsed object; Gen2 ones hold a JSON string, possibly fenced. Any
 * shape it cannot read yields null — a missing quote only weakens the hint.
 */
export function extractQuote(response: unknown): string | null {
  let parsed: unknown = response;
  if (typeof response === "string") {
    const stripped = response
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .replace(/,(\s*[}\]])/g, "$1")
      .trim();
    try {
      parsed = JSON.parse(stripped);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const quote = (parsed as { quote?: unknown }).quote;
  return typeof quote === "string" && quote.trim() ? quote.trim() : null;
}

/** Quotes from the horoscopes within WINDOW_DAYS of `dateId`, excluding it. */
export async function recentHoroscopeQuotes(
  uid: string,
  dateId: string,
): Promise<string[]> {
  const collection = admin
    .firestore()
    .collection("users")
    .doc(uid)
    .collection("horoscope");

  const refs: FirebaseFirestore.DocumentReference[] = [];
  for (let offset = -WINDOW_DAYS; offset <= WINDOW_DAYS; offset++) {
    if (offset === 0) continue;
    const id = offsetDateId(dateId, offset);
    if (id) refs.push(collection.doc(id));
  }
  if (refs.length === 0) return [];

  const snaps = await admin.firestore().getAll(...refs);
  const quotes = snaps
    .map((snap) => (snap.exists ? extractQuote(snap.data()?.response) : null))
    .filter((q): q is string => q !== null);

  return [...new Set(quotes)];
}

/**
 * The quote's subject for the day. All within the prompt's existing
 * "empowerment, relationship, or self-respect" brief — this narrows it, it
 * does not widen it.
 */
export const QUOTE_TOPICS = [
  "self-worth",
  "moving on from someone",
  "standards in love",
  "ambition and chasing goals",
  "friendship and who deserves access to you",
  "choosing yourself over being chosen",
  "protecting your peace",
  "money and independence",
  "confidence",
  "believing people when they show who they are",
  "patience and timing",
] as const;

/** The quote's shape for the day. */
export const QUOTE_STYLES = [
  "a blunt one-liner",
  "a clapback aimed at whoever doubted the user",
  'a reminder, opening with "Reminder:"',
  "a rhetorical question that makes the point",
] as const;

/** Whole days since the Unix epoch for a YYYY-MM-DD id, or null if malformed. */
function dayNumber(dateId: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateId);
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Math.floor(ms / 86_400_000);
}

/**
 * Picks the topic and style for a user's day.
 *
 * Deliberately a rotation, not a per-day random pick: stepping one topic per
 * day guarantees neighbouring days never share a topic, where independent
 * picks would collide one day in eleven. `seed` offsets the rotation so users
 * are not all on the same topic on the same day. The list lengths (11 and 4)
 * are coprime, so a topic/style pair recurs only every 44 days — keep them
 * coprime if you edit either list.
 *
 * Deterministic on (seed, dateId), so a regenerated horoscope keeps its topic.
 */
export function pickQuoteDirection(
  seed: number,
  dateId: string,
): { topic: string; style: string } | null {
  const day = dayNumber(dateId);
  if (day === null) return null;
  return {
    topic: QUOTE_TOPICS[(seed + day) % QUOTE_TOPICS.length],
    style: QUOTE_STYLES[((seed >>> 8) + day) % QUOTE_STYLES.length],
  };
}

/** Appends the day's quote topic and style to the horoscope prompt. */
export function withQuoteDirection(
  prompt: string,
  seed: number,
  dateId: string,
): string {
  const direction = pickQuoteDirection(seed, dateId);
  if (!direction) return prompt;
  return `${prompt}
====================================================
TODAY'S QUOTE DIRECTION
====================================================
The "quote" field for this date MUST be about: ${direction.topic}.
Write it as ${direction.style}.
Keep it original — not a famous or attributed quote — and under 20 words.
`;
}

/**
 * Appends a do-not-repeat block to the horoscope prompt. Returns the prompt
 * unchanged when there is nothing to avoid.
 */
export function withQuotesToAvoid(prompt: string, quotes: string[]): string {
  if (quotes.length === 0) return prompt;
  const list = quotes.map((q) => `- ${JSON.stringify(q)}`).join("\n");
  return `${prompt}
====================================================
RECENT QUOTES — DO NOT REPEAT
====================================================
These quotes were used on the user's surrounding days. The "quote" field MUST
NOT repeat, paraphrase, or reuse the central idea or key phrase of any of them.
Pick a different theme and a different sentence structure.
${list}
`;
}
