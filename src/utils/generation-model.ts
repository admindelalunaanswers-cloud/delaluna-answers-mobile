/**
 * generation-model.ts
 * Reports which generator answered an AI document, off a shipped device.
 *
 * Every AI feature follows the same contract — the client writes a `prompt`,
 * something server-side writes `response` back — and for most of them there
 * are currently *two* somethings: the first-party Gen2 Cloud Function and the
 * `firestore-genai-chatbot` extension instance it replaced, both still
 * triggered by the same document write. They answer on different models
 * (the extension's SDK is pinned to `gemini-2.5-flash` and rejects anything
 * newer), and whichever writes last is what the user sees, so "which model
 * produced this reading?" is not answerable from the text alone.
 *
 * Two fields tell them apart, in order of precision:
 *
 *   `model`          — stamped by the Gen2 functions, naming the exact model.
 *                      Only present once a build carrying that change is
 *                      deployed, so its absence proves nothing on its own.
 *   `interactionId`  — written by every Gen2 function since the migration and
 *                      by no extension, because the extension does not use the
 *                      Interactions API at all. This is the discriminator that
 *                      works today, and it stays correct regardless of which
 *                      function build is live.
 *
 * A document with neither is the extension's. Reporting on `model` alone would
 * mislabel every Gen2 document written before the stamping shipped.
 *
 * Uses `logger.info` deliberately: this has to be readable from a release
 * build via `adb logcat` / Console.app, which is the only way to answer the
 * question on a TestFlight or internal-track install. A model id is
 * configuration, not user data — nothing here touches the prompt, the
 * response, or the uid.
 */

import { logger } from '@/src/utils/logger';

/**
 * One line per feature/source pair, for the life of the process.
 *
 * These listeners re-fire on every snapshot — a single chat thread emits one
 * per message per update — and the interesting event is the *first* time a
 * given source answers for a given feature, not the hundredth. Without this
 * the banner would be buried in its own repetitions.
 */
const reported = new Set<string>();

/**
 * Logs the model behind one completed generation.
 *
 * Safe to call on every snapshot, including pending and failed ones: only a
 * document carrying a response is reported, since a document still generating
 * has no model to name yet.
 *
 * @param feature short, stable label for the call site — `horoscope`, `chat`
 * @param data    the raw Firestore document data
 */
export function logGenerationModel(
  feature: string,
  data: Record<string, unknown> | undefined,
): void {
  if (!data) return;

  // Nothing to report until an answer actually landed. `status.state` is not
  // used as the gate because the extension and the functions spell it
  // differently (`COMPLETED` vs `complete`), and a response is the thing that
  // matters either way.
  const response = data.response;
  if (typeof response !== 'string' || !response) return;

  const model = data.model;
  const interactionId = data.interactionId;

  let source: string;
  if (typeof model === 'string' && model) {
    source = model;
  } else if (typeof interactionId === 'string' && interactionId) {
    // A Gen2 function wrote this — it reached the Interactions API — but the
    // deployed build predates the `model` stamp, so the exact model is not
    // recoverable from the document.
    source = 'gen2 function (model not recorded — redeploy functions)';
  } else {
    source = 'genai-extension';
  }

  const key = `${feature}:${source}`;
  if (reported.has(key)) return;
  reported.add(key);

  logger.info(`[model] ${feature} answered by ${source}`);
}
