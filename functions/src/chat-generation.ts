/**
 * chat-generation.ts — replaces `firestore-genai-chatbot-update-5i5h`.
 *
 * Chat is the only feature where the extension did something beyond one-shot
 * generation, so it is the only one where the migration has to reproduce
 * behaviour rather than just re-point a call.
 *
 * ── The replay contract ─────────────────────────────────────────────────────
 * Before every generation the extension read *every other document* in
 * `users/{uid}/updayedChat`, ordered them by `createTime`, kept the ones older
 * than the current document, and replayed each as a pair of turns built from
 * `prompt` and `response`. A turn with either field empty was dropped
 * entirely. `CONTEXT` was injected ahead of all of it as a synthetic first
 * exchange.
 *
 * That is reproduced here exactly, because the client is written against it,
 * not merely against "the model remembers":
 *
 *   - `src/prompts/chat-continuity.ts` sends the ~5.5KB persona only on the
 *     opening turn and on reader switches, relying on replay to carry it
 *     forward. Change what gets replayed and the persona silently stops
 *     reaching the model on turn three.
 *   - `readerSwitchesUsed()` budgets reader switches by counting
 *     `[[READER_CHANGE]]` markers **over the turns the extension will actually
 *     replay**. A different replay set makes that count wrong, and the cap is
 *     what stops a thread accumulating persona copies forever.
 *   - Sessions restored by `resumeChatSession` are written with `prompt: ''`
 *     because the Firestore rules demand it, so they are invisible to replay
 *     by design — `chat-continuity.ts` compensates with an explicit recap.
 *     Making them visible would double up the recap.
 *
 * The one deliberate change: `CONTEXT` becomes a real `system_instruction`
 * instead of a fake user turn, and the whole thread hangs off the user's
 * anchor so chat inherits the same standing profile every other feature reads.
 *
 * ── Why not previous_interaction_id ─────────────────────────────────────────
 * Chaining each message to the last would be cheaper — the server would hold
 * the thread instead of it being resent every turn. It is not used here
 * because chat documents outlive interactions: Firestore keeps a conversation
 * forever, the interaction it was generated in expires after 55 days. A thread
 * older than that would lose its history with no way to rebuild it, whereas
 * replay reconstructs the conversation from Firestore every time and cannot go
 * stale. Each message records its `interactionId` anyway, so switching later
 * remains possible.
 */

import { createHash } from "crypto";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { generateWithAnchor } from "./anchor";
import { CHAT_CONTEXT, describeGenerationError } from "./interactions";

/** One replayed turn, in the shape the Interactions API takes as input. */
type Step = { type: string; content: { type: "text"; text: string }[] };

function textStep(type: "user_input" | "model_output", text: string): Step {
  return { type, content: [{ type: "text", text }] };
}

/**
 * Rebuilds the conversation the model should see, from Firestore.
 *
 * Ordering is by `createTime` and the cutoff is strict, matching the
 * extension's `ORDER_FIELD` and its "older than the current document" rule.
 * Documents missing `createTime` are excluded by the ordered query itself,
 * which is also what the extension did.
 */
async function buildReplay(
  collection: FirebaseFirestore.CollectionReference,
  currentId: string,
  currentCreateTime: Timestamp,
): Promise<Step[]> {
  const snap = await collection.orderBy("createTime").get();
  const steps: Step[] = [];

  for (const doc of snap.docs) {
    if (doc.id === currentId) continue;

    const createTime = doc.get("createTime");
    if (!(createTime instanceof Timestamp)) continue;
    if (createTime.toMillis() >= currentCreateTime.toMillis()) continue;

    const prompt = doc.get("prompt");
    const response = doc.get("response");
    // Both halves must be present. A turn still generating, one that failed,
    // and a restored session written with prompt:'' are all skipped — exactly
    // as `messagesToApi` dropped them.
    if (typeof prompt !== "string" || !prompt) continue;
    if (typeof response !== "string" || !response) continue;

    steps.push(textStep("user_input", prompt));
    steps.push(textStep("model_output", response));
  }

  return steps;
}

/**
 * Generates one chat reply.
 *
 * The failure path is load-bearing in a way the other features' is not:
 * `refundChatQuestion` is reached by `refundFailedChat`, which fires only on
 * the transition into `status.state == "ERROR"` **with no `response`**. A
 * question is billed at submit time, so a failure written in any other shape
 * charges the user for an answer they never received. That is why the catch
 * writes exactly that shape and never a partial response.
 */
export async function runChatGeneration(
  uid: string,
  ref: FirebaseFirestore.DocumentReference,
): Promise<void> {
  const db = admin.firestore();

  // Claim, keyed on createTime + prompt. A retry deletes the message it
  // supersedes and writes a new one, so the new document has a new createTime
  // and is picked up; our own write-back changes neither field and is ignored.
  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;

    const data = snap.data() ?? {};
    const prompt = data.prompt;
    if (typeof prompt !== "string" || !prompt) return null;

    const createTime = data.createTime;
    if (!(createTime instanceof Timestamp)) return null;

    const requestHash = createHash("sha256")
      .update(`${createTime.toMillis()}\n${prompt}`)
      .digest("hex");
    if (data.requestHash === requestHash) return null;

    tx.update(ref, { requestHash, status: { state: "PROCESSING" } });
    return { prompt, createTime };
  });

  if (!claim) return;

  try {
    const history = await buildReplay(ref.parent, ref.id, claim.createTime);

    console.info(
      `[generateChatMessage] replaying ${history.length / 2} prior turns`,
    );

    const { text, interactionId, model } = await generateWithAnchor(uid, {
      input: [...history, textStep("user_input", claim.prompt)],
      systemInstruction: CHAT_CONTEXT,
      plainText: true,
      label: "generateChatMessage",
    });

    await ref.update({
      response: text,
      status: { state: "COMPLETED" },
      generatedAt: FieldValue.serverTimestamp(),
      interactionId,
      // Which model answered this turn. Absent on any message the extension
      // wrote, which is how the two generators stay tellable apart.
      model,
    });
  } catch (err) {
    const reason = describeGenerationError(err);

    console.error(`[generateChatMessage] Generation failed — ${reason}`);

    // No `response` field, so refundFailedChat gives the question back.
    await ref.update({ status: { state: "ERROR", error: reason } });
  }
}
