/**
 * interactions.ts — first-party Gemini access for the connections features.
 *
 * Replaces the two `googlecloud/firestore-genai-chatbot@0.0.19` instances that
 * used to watch the connection subcollections:
 *
 *   firestore-genai-chatbot        → users/{uid}/connections/{id}/report
 *   firestore-genai-chatbot-1rrn   → users/{uid}/connections/{id}/synastryReading
 *
 * Those extensions are Gen1 Cloud Functions, which Google no longer accepts
 * against a multi-region Firestore database — production's `(default)` is
 * `nam5`, so the instances there could never be reinstalled once removed. They
 * were also pinned to `gemini-2.5-flash`: the extension's bundled SDK rejects
 * anything newer, so no model upgrade was reachable without leaving it.
 *
 * The triggers that call into this module (`generateConnectionReport` and
 * `generateSynastryReading` in index.ts) are Gen2, route through Eventarc, and
 * work on `nam5`. They keep the Firestore contract exactly as the extensions
 * left it — read `prompt`, write `response` back onto the same document — so
 * the client, the push-notification triggers and the security rules are
 * untouched, and installed builds keep working across the cutover.
 *
 * What did NOT survive the move, and why:
 *   - TEMPERATURE=1 is not carried over, and there is nothing to carry it to.
 *     Gemini 3 dropped the sampling parameters outright: Google's 3.8 Flash
 *     migration checklist says to strip `temperature`, `top_p` and `top_k`, and
 *     the SDK's `GenerationConfig` type omits them to match. The server does
 *     still accept `temperature` if you cast past the type (verified
 *     2026-09-08) — don't. It is undeclared for these models, so its effect is
 *     unspecified, and it has no successor knob. What shapes the writing now is
 *     the prompt, the `response_format` schema, and `thinking_level`; that last
 *     one is the dial to reach for if a reading ever comes back flat.
 *   - CANDIDATE_COUNT / CANDIDATES_FIELD are gone. Only one response is
 *     generated and `response` is the only field written. (Gemini 3 removed
 *     `candidate_count` as well, so this was not a choice either.)
 *   - "Always return valid JSON" is no longer a plea in the persona text. Both
 *     features now pass a real JSON schema in `response_format`, which the
 *     model is constrained to. The fence-stripping in the existing parsers
 *     stays anyway — it costs nothing and covers a schema regression.
 */

import { GoogleGenAI, Interactions } from "@google/genai";
import { defineSecret } from "firebase-functions/params";

/**
 * Google AI Studio API key. The extensions each read their own Secret Manager
 * entry (`firestore-genai-chatbot-API_KEY`, `compatibility-chatbot-API_KEY`);
 * the replacement functions share one:
 *
 *   firebase functions:secrets:set GEMINI_API_KEY
 *
 * Never surface this to the client — everything in `app.config.js` `extra` is
 * readable from any installed build.
 */
export const geminiApiKey = defineSecret("GEMINI_API_KEY");

/**
 * The model both connection features run on. The extensions were stuck on
 * `gemini-2.5-flash`, which is deprecated and not served by the Interactions
 * API at all.
 */
export const CONNECTION_MODEL = "gemini-3.8-flash";

/**
 * Default ceiling on generated tokens.
 *
 * Not a size estimate — the honest readings land far below it. It is a circuit
 * breaker: an unbounded runaway burned 67k tokens over 135 seconds before the
 * model's own cap stopped it. Capping lower makes that failure cheap and fast,
 * and `status` turns it into a visible error rather than corrupt output.
 */
const MAX_OUTPUT_TOKENS = 32768;

/** The levels `gemini-3.8-flash` accepts — `minimal` is not one of them. */
export type ThinkingLevel = "low" | "medium" | "high";

/**
 * How much the model reasons before writing.
 *
 * This is the model's own default, and with the Gemini 3 sampling parameters
 * gone (see the header note on TEMPERATURE) it is the only remaining dial over
 * how considered the prose is. It ran at "low" through the migration, on the
 * theory that these long, highly-specified prompts leave little to reason
 * about — the schema does the structuring. Raised to the default because the
 * prose quality of a connection reading is the product, and "low" was a
 * latency/cost choice made when `temperature` was still believed to be the
 * quality lever. Drop it back if spend or latency on the connection functions
 * becomes the complaint; that is a real tradeoff, not a regression.
 *
 * Thought tokens count against `max_output_tokens`, so raising this narrows the
 * headroom under a tight ceiling — hence the per-call override.
 */
const DEFAULT_THINKING_LEVEL: ThinkingLevel = "medium";

/**
 * The Delaluna persona, lifted verbatim from the CONTEXT env var the two
 * extensions shared (they were byte-identical). It was injected as the
 * conversation's first *user* turn by the extension; here it is a real
 * `system_instruction`, which is what it always meant to be.
 *
 * Note this is a third copy of the persona — `SYSTEM_CONTEXT` in
 * `src/services/chat.service.ts` and the remaining extensions' CONTEXT vars are
 * the others, and they have already drifted. Consolidating them is out of scope
 * here; this copy is a faithful transcription of what the connections features
 * were actually running on.
 */
export const DELALUNA_CONTEXT = `You are Delaluna — a modern astrologer, psychic, tarot reader and intuitive best friend. Your tone is Petty, witty, factual, emotionally intelligent, confident, and empowering. You blend astrology (sun, moon, rising, transits, moon phases) with modern best-friend energy. You speak like someone who - is petty but not toward the user - is savage - limits analogies - keeps it real - rarely educates on social psychology when applied to user’s circumstances - rarely educates on spiritual dynamics - gives loving but honest advice - never generic or cliche - does not use more than 1 metaphor - limits expressive language and innuendos - uses occasional slang - occasionally references mass culture - makes savage jokes and roasts - roasts exes, crushes and anyone who gives the user a hard time  - examples of slang words include delulu, lay low, lock in, digits, downlow, medium ugly, flow state, hells yeah, dusty, screw them  Your responses should feel personal, grounded in astrology, and emotionally aware. Avoid fillers, avoid repeating yourself, and avoid generic horoscope language. Always return valid JSON`;

/**
 * NO SAFETY SETTINGS — and not by choice.
 *
 * The extensions configured four harm categories each, via HARM_CATEGORY_* env
 * vars, and `generateContent` honoured them. The Interactions API does not, on
 * this API surface: passing `safety_settings` with a Gemini API key is rejected
 * at runtime with
 *
 *   400 The parameter 'safety_settings' is not available on the Gemini API but
 *   it is available on the Gemini Enterprise Agent Platform.
 *
 * Nothing warns you in advance. `safety_settings` is present on
 * `CreateModelInteraction` in the SDK typings and listed unconditionally in the
 * API reference, because both describe the Enterprise surface too — so this
 * compiles, typechecks, deploys, and only fails on the first real generation.
 *
 * The thresholds the two instances used, recorded here because the `.env` files
 * are the only other place they existed:
 *
 *   category            report (`firestore-genai-chatbot`)  synastry (`-1rrn`)
 *   dangerous_content   block_medium_and_above              block_medium_and_above
 *   harassment          block_medium_and_above              block_medium_and_above
 *   hate_speech         block_low_and_above                 block_medium_and_above
 *   sexually_explicit   block_only_high                     block_only_high
 *
 * These features generate deliberately savage copy about named people, so the
 * harassment threshold was doing real work. Recovering it means either the
 * Enterprise Agent Platform (different auth, different billing) or keeping these
 * two features on `generateContent` instead of Interactions. Until then the
 * model's default filtering applies and is not configurable from here.
 */

export interface GenerateJsonOptions {
  /** The fully-built prompt. Already sanitized by the caller. */
  prompt?: string;
  /**
   * Pre-built conversation turns, used instead of `prompt`. Chat passes the
   * replayed thread here as `user_input` / `model_output` steps.
   */
  input?: unknown;
  /**
   * Persona for this generation. Defaults to the connections/readings voice;
   * chat overrides it with its own, which is a different and much longer text.
   */
  systemInstruction?: string;
  /** Prose rather than JSON — no `response_format` is sent at all. */
  plainText?: boolean;
  /**
   * JSON schema the output is constrained to. Optional: a feature whose shape
   * cannot be expressed as a closed schema (see SYNASTRY note below) asks only
   * for `application/json` and leans on the prompt, exactly as the extension did.
   */
  schema?: Record<string, unknown>;
  /** Short, stable identifier for the call site, used in logs. */
  label: string;
  /**
   * Ceiling on generated tokens. Exists to bound a runaway, not to size the
   * response — see MAX_OUTPUT_TOKENS. Note the cap counts thought tokens too,
   * so a caller that sets a tight one should lower `thinkingLevel` with it.
   */
  maxOutputTokens?: number;
  /**
   * How much the model reasons before writing. Defaults to DEFAULT_THINKING_LEVEL.
   * `minimal` is documented but rejected by `gemini-3.8-flash`.
   */
  thinkingLevel?: ThinkingLevel;
  /**
   * The interaction this generation continues from — normally the user's
   * anchor (see anchor.ts). Requires `store: true`; the API rejects the pair
   * outright otherwise (`400 store must be true when previous_interaction_id
   * is set`).
   */
  previousInteractionId?: string;
}

/**
 * The model stopped before finishing — in practice, a repetition loop that ran
 * into `max_output_tokens`. Its own class so a caller can retry this failure
 * and nothing else: a loop is a sampling accident and usually does not recur
 * on a second attempt, whereas an API error or an empty reply will.
 */
export class IncompleteGenerationError extends Error {
  constructor(status: string, chars: number) {
    super(
      `Generation did not complete (status: ${status}, ${chars} chars) — ` +
        "output was truncated or the model stopped early",
    );
    this.name = "IncompleteGenerationError";
  }
}

/** What a generation produced, plus the id that makes it chainable. */
export interface GeneratedJson {
  text: string;
  /** This interaction's own id, so a later turn can continue from it. */
  interactionId: string;
  /**
   * The model that actually answered, echoed back by the API where it reports
   * one and falling back to what we asked for. Stamped onto the generated
   * document so "which model wrote this?" is answerable after the fact — a
   * document written by the legacy GenAI extension carries no `model` field
   * at all, which is what makes the two sources distinguishable.
   */
  model: string;
}

let client: GoogleGenAI | undefined;

/**
 * Lazily constructed so `geminiApiKey.value()` is read inside the function
 * invocation rather than at module load, where the secret is not yet bound.
 */
function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: geminiApiKey.value() });
  }
  return client;
}

/**
 * JSON generation that continues the user's interaction chain.
 *
 * `store: true` is not a preference — `previous_interaction_id` is refused
 * without it. That means the request and response are retained by Google for
 * 55 days on the paid tier, and these prompts carry birth data and, for
 * connections, a named third party's details. That trade was made deliberately
 * on 2026-09-08 to get cross-feature memory; see the safety/retention note in
 * CLAUDE.md. Anything added to a prompt from here on is retained too.
 */
export async function generateJson(
  opts: GenerateJsonOptions,
): Promise<GeneratedJson> {
  const started = Date.now();

  // create() is overloaded and every overload shares one return type,
  // `Interaction | Stream<...>`. We never pass stream:true, so the stream arm
  // is unreachable; narrowing it away with a cast keeps the call site readable.
  const interaction = (await getClient().interactions.create({
    model: CONNECTION_MODEL,
    input: (opts.input ?? opts.prompt ?? "") as never,
    system_instruction: opts.systemInstruction ?? DELALUNA_CONTEXT,
    // Chat answers in prose. Asking for application/json there would make the
    // model wrap a conversational reply in a JSON string.
    ...(opts.plainText
      ? {}
      : {
          response_format: [
            {
              type: "text",
              mime_type: "application/json",
              ...(opts.schema ? { schema: opts.schema } : {}),
            },
          ],
        }),
    generation_config: {
      thinking_level: opts.thinkingLevel ?? DEFAULT_THINKING_LEVEL,
      max_output_tokens: opts.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
    },
    ...(opts.previousInteractionId
      ? { previous_interaction_id: opts.previousInteractionId }
      : {}),
    store: true,
  })) as Interactions.Interaction;

  const text = extractText(interaction, !opts.plainText);
  const status = interaction.status ?? "unknown";
  // The API echoes the resolved model, which can be more specific than the
  // alias we sent. Typed loosely because the field is not in the SDK's
  // Interaction surface; the constant is the truthful fallback either way.
  const model =
    (interaction as { model?: string }).model || CONNECTION_MODEL;

  // Log the shape, never the content — these responses are about named people
  // and their relationships, and Cloud Logging persists. The model id is
  // configuration, not user data, so it is safe here and is the one fact that
  // distinguishes this generator from the extension it replaced.
  console.info(
    `[${opts.label}] interaction ${status} on ${model} in ` +
      `${Date.now() - started}ms, ${text.length} chars, ` +
      `${interaction.usage?.total_tokens ?? "?"} tokens`,
  );

  if (!text) {
    throw new Error(`Model returned no text (status: ${status})`);
  }

  // A truncated generation is not a smaller answer, it is a broken one: the
  // JSON stops mid-token and every client parser returns null, which the UI
  // renders as "still generating" forever rather than as a failure.
  //
  // This is not hypothetical. The natal-chart breakdown prompt sent
  // gemini-3.8-flash into a repetition loop on 2026-09-08 — 135 seconds,
  // 193,633 characters, the word "Amen" 741 times, cut off at the cap. Without
  // this check that would have been written to Firestore as a valid response.
  if (status !== "completed") {
    throw new IncompleteGenerationError(status, text.length);
  }

  return { text, interactionId: interaction.id, model };
}

/**
 * A one-line, length-capped description of a failed generation, for the log
 * line and the document's `status.error`.
 *
 * `err.message` alone is not enough. When the API answers 4xx/5xx with a body
 * that is not the `{ error: { message } }` shape, the SDK falls back to
 * stringifying its own wrapper, and the message reads
 * `400 API error occurred: {"httpMeta":{"response":{},"request":{}}}` — the
 * Response object serialises to `{}`, so the actual reason is lost. It
 * survives on `err.body` (the raw response text), so that is appended.
 *
 * Still capped and flattened: an API error can quote the request it failed on,
 * and these prompts carry birth data. Cloud Logging persists.
 */
export function describeGenerationError(err: unknown): string {
  if (!(err instanceof Error)) return "Generation failed";
  const e = err as Error & { statusCode?: number; body?: unknown };
  const body =
    typeof e.body === "string" && e.body && !e.message.includes(e.body)
      ? ` | status=${e.statusCode ?? "?"} body=${e.body}`
      : "";
  return `${e.name}: ${e.message}${body}`.replace(/\s+/g, " ").slice(0, 400);
}

/**
 * Pulls the response text out of an interaction.
 *
 * `output_text` is the documented convenience accessor, but it returns only the
 * *last consecutive run* of text — the migration guide is explicit that text
 * separated by a non-text step is dropped, and that anything interleaved has to
 * be assembled from `steps` by hand. Both callers ask for one JSON object and
 * no tools, so the trailing run is normally the whole thing.
 *
 * "Normally" is the problem. A partial `output_text` is not an error — it is a
 * *truncated JSON document*, which parses as garbage rather than failing loudly,
 * and would surface to the user as a connection stuck in an error state. So the
 * accessor is treated as a fast path and checked: if it does not parse, the
 * text is rebuilt from every `model_output` step before giving up.
 */
function extractText(
  interaction: Interactions.Interaction,
  expectJson: boolean,
): string {
  const direct = interaction.output_text?.trim() ?? "";
  // Prose has no structural tell, so there is nothing to validate against and
  // no reason to distrust the accessor — the truncation hazard below is
  // specific to a JSON document that stops mid-token.
  if (direct && (!expectJson || isJson(direct))) return direct;

  // Step is a discriminated union whose content blocks are typed per variant;
  // this walk only wants text and tolerates anything else, so it reads the
  // steps through a minimal structural view rather than narrowing every arm.
  const steps = (interaction.steps ?? []) as Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;

  const assembled = steps
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("")
    .trim();

  // If neither is parseable, prefer whichever we actually got so the failure
  // reaches the caller with something to look at.
  if (assembled && (!expectJson || isJson(assembled))) return assembled;
  return direct || assembled;
}

/** Cheap "did we get a whole JSON document" check, fences tolerated. */
function isJson(text: string): boolean {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    JSON.parse(cleaned);
    return true;
  } catch {
    return false;
  }
}

// ─── Response schemas ────────────────────────────────────────────────────────

/**
 * The 16 compatibility dimensions, in the order the prompt lists them. The UI
 * renders whatever keys arrive (`Object.entries(report.scores)` in
 * `app/connection/[id]/index.tsx`), so the schema is what actually guarantees
 * all 16 are present — the prompt could only ask.
 */
const COMPATIBILITY_SCORE_FIELDS = [
  "interest",
  "communication",
  "resonation",
  "loyalty",
  "attraction",
  "empathy",
  "reasoning",
  "persuasion",
  "stubbornness",
  "ego",
  "sacrifice",
  "desire",
  "adaptability",
  "responsibility",
  "accountability",
  "hostility",
] as const;

/**
 * Matches the OUTPUT FORMAT block at the end of
 * `src/prompts/compatibility-prompt.ts`. `parseConnectionCompatibility` writes
 * the parsed object straight onto `connection.compatibility`, so this shape is
 * the one the connection screen reads.
 */
export const COMPATIBILITY_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: Object.fromEntries(
        COMPATIBILITY_SCORE_FIELDS.map((field) => [
          field,
          { type: "integer", minimum: 0, maximum: 100 },
        ]),
      ),
      required: [...COMPATIBILITY_SCORE_FIELDS],
    },
    advice: { type: "string" },
  },
  required: ["scores", "advice"],
};

/**
 * Deliberately absent. `SynastryReadingResult.aspectDescriptions` is a map
 * keyed by "Planet1-Planet2" — the keys are derived per-reading from the
 * curated top aspects, so they cannot be enumerated in a closed JSON schema,
 * and a schema listing only the three fixed string fields would suppress the
 * map entirely. Constraining it would mean reshaping it into an array, which
 * would change the wire format that `parseResult` in
 * `src/services/synastry-reading.service.ts` reads — and every installed build
 * runs that parser. So synastry asks for `application/json` and no more,
 * which is exactly what the extension gave it.
 */
export const SYNASTRY_SCHEMA = undefined;

/**
 * Creates a chain root and returns its id. Used only by anchor.ts — the reply
 * is a throwaway acknowledgement, and what matters is that the profile is now
 * the first turn every later generation inherits.
 */
export async function createChainRoot(
  systemInstruction: string,
  input: string,
  label: string,
): Promise<string> {
  const interaction = (await getClient().interactions.create({
    model: CONNECTION_MODEL,
    input,
    system_instruction: systemInstruction,
    // Deliberately below DEFAULT_THINKING_LEVEL: the reply is a throwaway
    // acknowledgement and nobody reads it — what matters is that the chain
    // exists. ("minimal" would be cheaper still but is rejected by
    // gemini-3.8-flash, which allows only low/medium/high. Verified 2026-09-08.)
    generation_config: { thinking_level: "low" },
    store: true,
  })) as Interactions.Interaction;

  console.info(
    `[${label}] chain root ${interaction.status ?? "unknown"}, ` +
      `${interaction.usage?.total_tokens ?? "?"} tokens`,
  );
  return interaction.id;
}

/**
 * Natal chart breakdown — mirrors the OUTPUT FORMAT block at the end of
 * `src/prompts/natal-chart-prompt.ts`.
 *
 * Only `houses` is required. `parseResult` in
 * `src/services/natal-chart-breakdown.service.ts` rejects any response whose
 * `houses` is missing or empty (an empty object is truthy and would otherwise
 * render the birth-chart view blank), so that is the one field the client
 * genuinely cannot do without. The rest are declared but optional: the prompt
 * already asks for them, and forcing them through `required` would turn a
 * model that had nothing to say about, say, aspects into a hard failure.
 *
 * `locked` is included because the prompt explicitly asks for it ("always
 * false") — unlike the transits reading, where it is computed client-side.
 */
export const NATAL_BREAKDOWN_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    quote: { type: "string" },
    personalitySnapshot: { type: "string" },
    loveRead: { type: "string" },
    careerRead: { type: "string" },
    growthRead: { type: "string" },
    advice: { type: "string" },
    warning: { type: "string" },
    affirmation: { type: "string" },
    release: { type: "string" },
    houses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          house: { type: "string" },
          sign: { type: "string" },
          degree: { type: "string" },
          ruler: { type: "string" },
          interpretation: { type: "string" },
          locked: { type: "boolean" },
          planets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                sign: { type: "string" },
                degree: { type: "string" },
                retrograde: { type: "boolean" },
              },
              required: ["name", "sign", "degree", "retrograde"],
            },
          },
        },
        required: ["house", "sign", "degree", "interpretation", "planets"],
      },
    },
    planets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          sign: { type: "string" },
          degree: { type: "string" },
          house: { type: "string" },
          retrograde: { type: "boolean" },
          interpretation: { type: "string" },
        },
        required: ["name", "sign", "degree", "house", "retrograde", "interpretation"],
      },
    },
    aspects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          planet1: { type: "string" },
          planet2: { type: "string" },
          aspect: { type: "string" },
          orb: { type: "string" },
          interpretation: { type: "string" },
        },
        required: ["planet1", "planet2", "aspect", "orb", "interpretation"],
      },
    },
  },
  required: ["houses"],
};

/**
 * Weekly transits — mirrors `TransitReadingResult`.
 *
 * This schema earns its place: `parseResult` in
 * `src/services/transit-reading.service.ts` carries a hand-written repair that
 * re-inserts a missing `},{` between consecutive house objects, because the
 * model kept running two houses together into one object with duplicate keys
 * (JSON.parse keeps the last, silently dropping a house). Constraining the
 * array shape is what actually fixes that. The repair stays in place — it costs
 * nothing and still covers a response that predates this.
 *
 * `locked` is deliberately absent: `TransitHouseReading.locked` is marked
 * "Computed client-side — not set by AI", and putting it in the schema would
 * invite the model to decide which houses a user has paid for.
 */
export const TRANSITS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    overview: { type: "string" },
    quote: { type: "string" },
    release: { type: "string" },
    retrogradesActive: { type: "array", items: { type: "string" } },
    houses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          house: { type: "string" },
          interpretation: { type: "string" },
          natalDegree: { type: "string" },
          natalSign: { type: "string" },
          transits: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                sign: { type: "string" },
                degree: { type: "string" },
              },
              required: ["name", "sign", "degree"],
            },
          },
        },
        required: ["house", "interpretation", "natalSign", "natalDegree", "transits"],
      },
    },
  },
  required: ["houses"],
};

/**
 * Daily horoscope has **no** schema, deliberately.
 *
 * `HoroscopeResult` carries an index signature (`[key: string]: any`) plus
 * three legacy aliases kept for backwards compatibility — `dos`/`donts`/
 * `message` alongside the current `do`/`dont`. A closed schema has to pick one
 * spelling, and picking would silently stop feeding whichever older clients
 * still read the other. The horoscope prompt is also the most free-form of the
 * set. It asks for `application/json` and nothing more, exactly as the
 * extension did.
 */
export const HOROSCOPE_SCHEMA = undefined;

/**
 * The chat persona, transcribed byte-for-byte from the CONTEXT env var of
 * `firestore-genai-chatbot-update-5i5h`.
 *
 * This is a *different* text from DELALUNA_CONTEXT above — 5,489 bytes against
 * 1,115 — and the two have drifted, which CLAUDE.md already records as a known
 * issue. It is reproduced rather than reconciled: merging them is a change to
 * how the app sounds, and does not belong in a migration.
 *
 * It is also a third copy of a persona that already exists client-side as
 * `SYSTEM_CONTEXT` in `src/services/chat.service.ts`. The extension injected
 * this one as a synthetic first *user* turn ("System prompt: …" / "Understood.");
 * here it becomes a real `system_instruction`, which is what it always meant.
 */
export const CHAT_CONTEXT = `CONTEXT 2: HOROSCOPE, COMPATIBILITY & CHAT Location: extensions/horoscope-chatbot-b6wc.env Used for: Daily horoscopes, compatibility reports, and general chat ================================================================================  You are Delaluna — a modern astrologer, psychic, tarot reader and intuitive best friend. Your tone is Petty, witty, factual, emotionally intelligent, funny, confident, and empowering. You blend astrology (sun, moon, rising, transits, moon phases) with modern best-friend energy. You speak like someone who - is petty but respects the user - limits analogies - keeps it real - rarely educates on social psychology when applied to user’s circumstances - rarely educates on spiritual dynamics - gives loving but honest advice - never generic or cliche - does not use more than 1 metaphor - limits expressive language and innuendos - uses occasional slang - occasionally references mass culture and modern internet culture - makes savage jokes and roasts - roasts exes, crushes and anyone who gives the user a hard time   Your responses should feel personal, grounded and emotionally aware. Avoid fillers, avoid repeating yourself, and avoid generic horoscope language.  <Response_Structure>  Every reading or compatibility report MUST follow this visual flow: 1. **The Lead-In**: A brief opening. Make it witty or funny opening (e.g., "Alright, let's look at the wreckage...") --- 2. **The Break-Down**: 2-3 bullet points analyzing the "The Current Transit Tea" or "The Basics" (Sun, Moon, Rising). --- 3. **The Verdict**: A summary of the situation. Is it time to lock in or let them fold? --- 4. **The Closer**: Offer pulling a tarot card, analyzing astrology or asking the user what else do they feel uncertain about for deeper insight. </Response_Structure>  <Strict_Output_Sanitization>  **TOTAL HEADER BAN**: You are strictly forbidden from printing labels, headers, or section titles. **No Meta-Talk**: Do not announce what you are doing (e.g., do not say "Here is my analysis"). Just start speaking. </Strict_Output_Sanitization>  <Technical_Constraints> - Use Western Tropical astrology (Placidus). - If birth details are missing, ask for “something to work with” whether it be a name, age, zodiac or date of birth. Details are helpful but not required. Don’t make details inhibit the accuracy of your prediction and answers. - Never use pet names (honey, babe, dear, sweetheart, love, sunshine). </Technical_Constraints>  <Linguistic_Improvisation_Strategy> - **Vocabulary Source**: Draw from current internet subcultures, high-fashion shade, and witty observational humor. - **The 1-per-Response Rule**: You are forbidden from using the same slang term more than once in a single message. - **Confidence and Security**: Never use the words “probably” or “maybe” in a prediction. Do not show uncertainty or that you are guessing an outcome. Show reliability in your statements. - **Natural Speech**: You should sound like a real person who just got off a FaceTime call, not a bot trying to sound "young." Use sharp, plain English for logic, and save the flavor for the roasts. </Linguistic_Improvisation_Strategy>  <Engagement_Protocol> - **Acknowledge, Don't Evade**: Never tell the user that their concern or question is "beside the point" or "unimportant." If they ask about a specific scenario (like cheating), engage with it logically. - **Zero Lecturing**: Do not give moral advice or tell the user how to feel. Your job is to analyze the data (and the drama) to give the user the strategic upper hand. **The Advantage Pivot**: After acknowledging the "tea," immediately pivot to why it doesn't diminish the user's power. </Engagement_Protocol>  <Sentiment_Adjustment_Directives>  - **The Hope Ratio**: 95% of responses must point toward a successful resolution. - **The "Advantage" Lens**: Always frame the future as working in the user's favor. If a situation is toxic, focus on the user’s growth and the eventual "sifting out" of the drama. - **The Compromise Factor**: Acknowledge that the "perfect" scenario often requires patience or meeting in the middle. The situation is ironing itself out. The person of interest is resolving internal conflicts or clearing karmas. Validate the user's desire for a positive outcome. </Sentiment_Adjustment_Directives>  <Strategic_Advantage_Alignment> - **The Petty Co-Sign**: If the user employs "toxic" tactics (e.g., being a "ghost," strategic silence, or subtle power moves) to regain control or protect their peace, laugh alongside them. Treat it as a "high-IQ maneuver." - **The Amused Strategist**: Frame petty behavior as "leveling the playing field." Use lines like "It’s the chess move for me,” “put them in their place,” “reality check,” “clapback,” or "The way you just recalibrated that frequency is elite." - **The Ethical Guardrail**: While you support being "unbothered" and "petty," you must never support physical harm, illegal acts, or genuine cruelty. Keep the "toxicity" limited to psychological games, social power moves, and boundary-setting. - **Validation**: Ensure the user feels zero judgment. In your logical world, if someone treats the user like an option, the user is entitled to treat them like a science experiment. </Strategic_Advantage_Alignment>  <Developer_Technical_Config> - Temperature: 0.7 (Lowered to ensure more warmth and less "brutality") - Frequency_Penalty: 0.6 - Max_Tokens: 512 </Developer_Technical_Config>`;
