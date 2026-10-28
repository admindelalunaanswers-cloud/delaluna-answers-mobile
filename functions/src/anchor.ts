/**
 * anchor.ts — the per-user root of the interaction chain.
 *
 * Every AI feature continues from one interaction per user rather than from
 * whatever ran most recently. That shape was chosen deliberately over a single
 * linear chain:
 *
 *   - **Cost stays bounded.** A linear chain replays everything that came
 *     before, so the Nth generation of the week pays for the previous N-1. With
 *     an anchor, every feature pays for exactly one profile.
 *   - **Nothing contends for a head pointer.** The 8am horoscope and the Sunday
 *     transits fire concurrently; under a linear chain they would race to
 *     record which one the next generation continues from. Branching from a
 *     fixed anchor has no such write.
 *   - **Features stay independent.** A failed or slow generation cannot stall
 *     or poison the chain other features read from.
 *
 * The cost of that choice: today's horoscope does not see yesterday's transits.
 * Cross-feature memory comes from the *profile*, not from sibling readings —
 * which is why the profile carries saved connections. That is what lets a
 * horoscope mention the user's situationship by name without ever having read
 * the compatibility report. The daily horoscope is the exception — it opts
 * out of the anchor (`anchored: false` in index.ts) so it never mentions them.
 *
 * Anchors expire. Interactions are retained 55 days on the paid tier, so the
 * anchor is rebuilt well before that (`ANCHOR_TTL_MS`), and any generation that
 * is refused because its parent went away rebuilds and retries once.
 */

import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import {
  DELALUNA_CONTEXT,
  createChainRoot,
  generateJson,
  type GeneratedJson,
  type GenerateJsonOptions,
} from "./interactions";

/**
 * Rebuild cadence. Comfortably inside the 55-day paid-tier retention window —
 * the gap absorbs a user who does not open the app for a few weeks, so their
 * anchor is refreshed on their next visit rather than found dead.
 */
const ANCHOR_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** How many saved connections go into the profile, newest first. */
const MAX_PROFILE_CONNECTIONS = 8;

/** `admin.firestore()` is resolved per call — index.ts owns initializeApp(). */
function db() {
  return admin.firestore();
}

/**
 * Builds the standing-facts block: who this person is, astrologically, and who
 * is currently in their life. Deliberately compact — it is replayed on every
 * single generation for the next 30 days, so every line is paid for many times.
 *
 * Contains no birth date, birth time or birth place. The derived placements are
 * what a reading actually needs, and they are far less identifying than the raw
 * details would be sitting in 55-day retention.
 */
/**
 * Pulls sun/moon/rising out of `users/{uid}/natalChart/details`.
 *
 * That document has two shapes and this has to survive both. `requestBreakdown`
 * (`src/services/natal-chart-breakdown.service.ts`) *deletes* the document and
 * rewrites it as `{ prompt, natalChart, requestedAt }`, where `natalChart` is
 * the chart **JSON-encoded into a string** — so after any breakdown request the
 * top-level `planets` / `ascendant` fields are simply gone. Verified against
 * live data 2026-09-08: every stored chart is in the string form.
 *
 * There is also no `moon` object in the stored chart at all. The Moon is a row
 * in `planets` like any other body, so it is read from there.
 *
 * Reading only the object form would not error — it would quietly yield a
 * profile with no chart in it, which is the kind of failure that looks like the
 * model being vague rather than like a bug.
 */
function readBig3(data: FirebaseFirestore.DocumentData | undefined): string[] {
  if (!data) return [];

  let chart: Record<string, unknown> = data;
  if (typeof data.natalChart === "string") {
    try {
      chart = JSON.parse(data.natalChart);
    } catch {
      return [];
    }
  }

  const planets = Array.isArray(chart.planets)
    ? (chart.planets as { name?: string; sign?: string }[])
    : [];
  const signOf = (name: string) => planets.find((p) => p?.name === name)?.sign;

  const ascendant = chart.ascendant as { sign?: string } | undefined;
  const moon = chart.moon as { sign?: string } | undefined;

  const sun = signOf("Sun");
  const moonSign = moon?.sign ?? signOf("Moon");
  const rising = ascendant?.sign;

  return [
    sun && `${sun} sun`,
    moonSign && `${moonSign} moon`,
    rising && `${rising} rising`,
  ].filter((v): v is string => Boolean(v));
}

async function buildProfile(uid: string): Promise<string> {
  const userRef = db().collection("users").doc(uid);

  const [userSnap, chartSnap, connectionsSnap] = await Promise.all([
    userRef.get(),
    userRef.collection("natalChart").doc("details").get(),
    userRef
      .collection("connections")
      .orderBy("createTime", "desc")
      .limit(MAX_PROFILE_CONNECTIONS)
      .get()
      .catch(() => null),
  ]);

  const lines: string[] = [];
  const pronouns = String(userSnap.data()?.pronouns ?? "").trim();
  lines.push(`Pronouns: ${pronouns || "they/them"}.`);

  const placements = readBig3(chartSnap.data());
  if (placements.length) lines.push(`Chart: ${placements.join(", ")}.`);

  const connections = connectionsSnap?.docs ?? [];
  if (connections.length) {
    lines.push("People in their life:");
    for (const doc of connections) {
      const d = doc.data();
      const name = String(d.secondPerson?.firstName ?? "").trim();
      if (!name) continue;
      const type = String(d.relationshipType ?? "").trim();
      const scores = d.compatibility?.scores as
        | Record<string, number>
        | undefined;
      let headline = "";
      if (scores) {
        const entries = Object.entries(scores).filter(
          ([, v]) => typeof v === "number",
        );
        if (entries.length) {
          const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
          const worst = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
          headline = ` — strongest ${best[0]}, weakest ${worst[0]}`;
        }
      }
      lines.push(`- ${name}${type ? ` (${type})` : ""}${headline}`);
    }
  }

  return lines.join("\n");
}

/**
 * The chain root's own turn. Framed as briefing rather than as a question, so
 * the acknowledgement is short and — more importantly — so the model does not
 * treat the profile as a request for a reading. Every later generation inherits
 * this exchange, so a chatty answer here would be replayed forever.
 */
function anchorPrompt(profile: string): string {
  return (
    "[[PROFILE]] Standing facts about the person you read for. Hold on to " +
    "them for everything that follows. Do not produce a reading, do not " +
    "greet them, and do not comment on the facts — reply with the single " +
    'word "Ready".\n\n' +
    profile
  );
}

/** Drops the anchor so the next generation rebuilds it. */
export async function invalidateAnchor(uid: string): Promise<void> {
  await db()
    .collection("users")
    .doc(uid)
    .set(
      {
        interactionAnchorId: FieldValue.delete(),
        interactionAnchorAt: FieldValue.delete(),
      },
      { merge: true },
    );
}

/** Creates a fresh anchor and records it on the user document. */
async function createAnchor(uid: string): Promise<string> {
  const profile = await buildProfile(uid);
  const id = await createChainRoot(
    DELALUNA_CONTEXT,
    anchorPrompt(profile),
    "anchor",
  );

  await db().collection("users").doc(uid).set(
    {
      interactionAnchorId: id,
      interactionAnchorAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  console.info(`[anchor] created for ${uid}, profile ${profile.length} chars`);
  return id;
}

/** Returns a usable anchor id, creating one if missing or past its TTL. */
async function ensureAnchor(uid: string): Promise<string> {
  const snap = await db().collection("users").doc(uid).get();
  const data = snap.data() ?? {};
  const id = data.interactionAnchorId;
  const at = data.interactionAnchorAt;

  const fresh =
    typeof id === "string" &&
    id.length > 0 &&
    at instanceof Timestamp &&
    Date.now() - at.toMillis() < ANCHOR_TTL_MS;

  return fresh ? (id as string) : createAnchor(uid);
}

/**
 * True when a failure is the chain root having gone away — aged past retention,
 * or deleted.
 *
 * The real error is a bare `404 Requested entity was not found.` It names
 * neither the interaction nor the field that referenced it, so there is nothing
 * more specific to match on. Verified 2026-09-08 by creating a parent, deleting
 * it, and chaining off the dead id.
 *
 * A broad match is safe *here* specifically: this is only consulted on a call
 * that passed `previous_interaction_id`, and the model id is a compile-time
 * constant, so the parent is the only entity in the request that can be
 * missing. Worst case the retry rebuilds an anchor that did not need rebuilding.
 *
 * Getting this wrong is silent and slow: the anchor TTL is 30 days, so a
 * predicate that fails to match would look perfectly healthy for a month and
 * then break every generation at once.
 */
function isDeadChainError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  return (
    message.includes("404") ||
    message.includes("not found") ||
    message.includes("previous_interaction") ||
    message.includes("expired")
  );
}

/**
 * Generates with the user's anchor as context, rebuilding the anchor once if it
 * turns out to be dead.
 *
 * The retry deliberately builds a *new* anchor rather than dropping continuity:
 * a rebuilt profile is current, and the alternative — silently generating
 * without context — would produce a reading that had forgotten the user, which
 * is worse than a slightly slower one.
 */
export async function generateWithAnchor(
  uid: string,
  opts: Omit<GenerateJsonOptions, "previousInteractionId">,
): Promise<GeneratedJson> {
  const anchorId = await ensureAnchor(uid);

  try {
    return await generateJson({ ...opts, previousInteractionId: anchorId });
  } catch (err) {
    if (!isDeadChainError(err)) throw err;

    console.info(`[${opts.label}] anchor rejected, rebuilding once`);
    await invalidateAnchor(uid);
    const rebuilt = await createAnchor(uid);
    return generateJson({ ...opts, previousInteractionId: rebuilt });
  }
}
