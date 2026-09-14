/**
 * prompt-test.ts — the admin prompt scratchpad's call into Cloud Functions.
 *
 * Goes through a callable rather than talking to Gemini directly, for the same
 * reason the moderation writes do: the API key is a Secret Manager entry and
 * must never reach a browser. See `runPromptTest` in functions/src/index.ts.
 */

import { httpsCallable } from 'firebase/functions';

import { functions } from './firebase';

export interface PromptRun {
  prompt: string;
  /** The context / system instruction. Empty string means "no persona". */
  systemInstruction?: string;
  /** Set on every turn after the first — this is what makes it a conversation. */
  previousInteractionId?: string;
}

/**
 * A failed generation comes back as `ok: false` rather than a thrown error —
 * a truncation or a model that stopped early is a result worth reading, and an
 * HttpsError would arrive in the browser as a bare "internal".
 */
export type PromptResult =
  | {
      ok: true;
      text: string;
      model: string;
      interactionId: string;
      elapsedMs: number;
    }
  | { ok: false; error: string; elapsedMs: number };

export async function runPrompt(run: PromptRun): Promise<PromptResult> {
  try {
    const res = await httpsCallable(functions, 'runPromptTest')(run);
    return res.data as PromptResult;
  } catch (err) {
    // Only transport and permission failures land here; generation failures
    // arrive as a well-formed `ok: false`.
    const e = err as { message?: string };
    return {
      ok: false,
      error: (e?.message ?? 'The request failed.').replace(/^[a-z-]+:\s*/i, ''),
      elapsedMs: 0,
    };
  }
}
