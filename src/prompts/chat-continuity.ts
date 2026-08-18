/**
 * chat-continuity.ts
 *
 * Builds the `prompt` field for a single chat turn, given everything already
 * in the conversation.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * The chat extension (`googlecloud/firestore-genai-chatbot`) is not a one-shot
 * generator: before every call it reads *every other document* in
 * `users/{uid}/updayedChat`, orders them by `createTime`, keeps the ones older
 * than the current document, and replays them to Gemini as alternating
 * user/model turns built from the `prompt` and `response` fields. The
 * extension's `CONTEXT` env var is injected ahead of that as a synthetic first
 * turn (`"System prompt: …"` / `"Understood."`).
 *
 * Two consequences drive the whole design here:
 *
 * 1. **Whatever goes in `prompt` is re-sent on every later turn, forever.**
 *    Prepending the ~5.5KB persona to each turn meant turn N carried N copies
 *    of it, and each copy landed in the *user* role — so the model kept
 *    re-reading "every reading MUST follow this 4-part structure" as if it
 *    were the newest instruction, and answered every follow-up as a fresh
 *    standalone reading. The persona is now sent once, on the turn that opens
 *    a conversation, and inherited by every turn after it.
 *
 * 2. **A turn with an empty `prompt` or an empty `response` is skipped
 *    entirely** (`messagesToApi` drops it). Restored sessions are written by
 *    `resumeChatSession` with `prompt: ''` — Firestore rules require that, so
 *    that a client cannot trigger a billable generation — which means the model
 *    cannot see a single turn of a resumed conversation even though the user is
 *    looking at all of it. That gap is closed here with an explicit recap.
 *
 * Everything is marked with `[[BRACKET]]` tokens rather than headings on their
 * own lines, because `sanitizePrompt` in the Cloud Function may collapse the
 * layout; the markers survive whitespace collapsing and are also what lets a
 * later turn detect what an earlier turn already said.
 */

/** The parts of a chat document this module reasons about. */
export interface ContinuityTurn {
  userMessage: string;
  /** Empty for turns restored from a saved session — invisible to the model. */
  prompt: string;
  response: string | null;
  isError: boolean;
  connectionId?: string;
}

export interface ChatConnectionSummary {
  id: string;
  name: string;
  contextSummary: string;
}

export interface ChatTurnInput {
  userMessage: string;
  /** The persona. Sent only on the turn that opens a conversation. */
  systemContext: string;
  natalChartSummary?: string;
  connection?: ChatConnectionSummary;
  /**
   * Tarot mode only: the spread drawn for *this* question, already rendered.
   * Unlike the persona and the chart, this is per-turn and so is sent every
   * time — a follow-up gets its own card, and the persona decides whether to
   * play it or stay with the one already on the table.
   */
  tarotDraw?: string;
  /** Every document currently in the conversation, oldest first. */
  history?: ContinuityTurn[];
}

// Section markers. These double as a record of what previous turns already
// carried, so they must stay stable — changing one makes older turns
// unreadable to this logic and re-sends context that is already in the thread.
const MARK_CHART = '[[CHART]]';
const MARK_CARD = '[[CARD]]';
const MARK_CONNECTION = '[[SUBJECT]]';
const MARK_SUBJECT_CHANGE = '[[SUBJECT_CHANGE]]';
const MARK_NOW = '[[NOW]]';
const RECAP_PATTERN = /\[\[RECAP:(\d+)\]\]/g;

// Prompts written before this module existed have no markers. Recognising
// their headers keeps an in-flight conversation from having its chart and
// connection context re-sent on the user's first turn after updating.
const LEGACY_CHART_HEADER = "The user's natal chart for personalized answers:";
const LEGACY_CONNECTION_HEADER = "Context on the person they're asking about";

// Recap budget. A restored session can be long; the recap is a memory aid, not
// a transcript, so replies are trimmed hard and only the tail is kept.
const MAX_RECAP_TURNS = 6;
const MAX_RECAP_REPLY_CHARS = 320;
const MAX_RECAP_CHARS = 2500;

/** Matches `prompt` in SendChatMessageSchema — over this the call is rejected. */
const MAX_PROMPT_CHARS = 32000;

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Trims to `max` characters *including* the ellipsis, so the cap is a real cap. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * True when the extension will replay this turn to the model.
 *
 * A turn still awaiting its response does not count, so sending a second
 * message while the first is in flight re-sends the persona. That is the safe
 * direction: if the in-flight turn ends up failing, it is never replayed, and
 * anchoring to it would leave the conversation with no persona at all.
 */
function isVisibleToModel(turn: ContinuityTurn): boolean {
  return turn.prompt.trim().length > 0 && !!turn.response && !turn.isError;
}

/** True when the user can see this turn but the model cannot. */
function isRestored(turn: ContinuityTurn): boolean {
  return turn.prompt.trim().length === 0 && !!turn.response;
}

function someVisiblePromptIncludes(visible: ContinuityTurn[], ...needles: string[]): boolean {
  return visible.some(turn => needles.some(needle => turn.prompt.includes(needle)));
}

/** How many restored turns a previous turn already recapped. */
function recappedCount(visible: ContinuityTurn[]): number {
  let highest = 0;
  for (const turn of visible) {
    for (const match of turn.prompt.matchAll(RECAP_PATTERN)) {
      highest = Math.max(highest, Number(match[1]));
    }
  }
  return highest;
}

/** Who the most recent model-visible turn was about, or null for nobody. */
function lastSubjectId(visible: ContinuityTurn[]): string | null {
  return visible.length > 0 ? visible[visible.length - 1].connectionId ?? null : null;
}

function buildRecap(restored: ContinuityTurn[], visible: ContinuityTurn[]): string | null {
  if (restored.length === 0) return null;
  // Already covered by an earlier turn, which the extension replays for us.
  if (restored.length <= recappedCount(visible)) return null;

  const body = truncate(
    restored
      .slice(-MAX_RECAP_TURNS)
      .map(
        turn =>
          `User: ${collapse(turn.userMessage)} → You: ` +
          truncate(collapse(turn.response ?? ''), MAX_RECAP_REPLY_CHARS),
      )
      .join(' || '),
    MAX_RECAP_CHARS,
  );

  return (
    `[[RECAP:${restored.length}]] Earlier turns of this same conversation, restored from a saved ` +
    `session. You said these things — stay consistent with them, do not repeat them, and do not ` +
    `re-ask for anything already answered here: ${body}`
  );
}

/**
 * Builds the prompt for one turn.
 *
 * The persona, the natal chart and a connection's context are each sent once
 * and then inherited from the replayed history; only what the model has not
 * already been told is added to a given turn.
 */
export function buildChatTurnPrompt(input: ChatTurnInput): string {
  const history = input.history ?? [];
  const visible = history.filter(isVisibleToModel);
  const restored = history.filter(isRestored);

  // "Anchored" = at least one earlier turn will be replayed, so the persona
  // and anything else that turn carried is already in the model's context.
  const anchored = visible.length > 0;

  const parts: string[] = [];

  if (!anchored) {
    parts.push(input.systemContext.trim());
  }

  if (
    input.natalChartSummary &&
    !someVisiblePromptIncludes(visible, MARK_CHART, LEGACY_CHART_HEADER)
  ) {
    parts.push(
      `${MARK_CHART} The user's natal chart, as background personalisation only — never name a ` +
        `placement back to them: ${input.natalChartSummary.trim()}`,
    );
  }

  const previousSubject = lastSubjectId(visible);
  const currentSubject = input.connection?.id ?? null;
  const subjectChanged = currentSubject !== previousSubject;

  if (input.connection) {
    const alreadySent = someVisiblePromptIncludes(
      visible,
      MARK_CONNECTION,
      MARK_SUBJECT_CHANGE,
      LEGACY_CONNECTION_HEADER,
    );
    if (subjectChanged || !alreadySent) {
      const lead =
        anchored && subjectChanged && previousSubject
          ? `${MARK_SUBJECT_CHANGE} The user has switched who they are asking about. From here on ` +
            `this is about ${input.connection.name}, not whoever was being discussed above.`
          : `${MARK_CONNECTION} The user is asking about ${input.connection.name}.`;
      parts.push(`${lead} ${input.connection.contextSummary.trim()}`);
    }
  } else if (anchored && previousSubject) {
    parts.push(
      `${MARK_SUBJECT_CHANGE} The user is no longer asking about the person discussed above — ` +
        `this turn is about them. Keep what you already know, but do not steer back to that person ` +
        `unless the user does.`,
    );
  }

  const recap = buildRecap(restored, visible);
  if (recap) parts.push(recap);

  if (input.tarotDraw?.trim()) {
    parts.push(
      `${MARK_CARD} The card drawn for this question: ${input.tarotDraw.trim()}`,
    );
  }

  parts.push(`${MARK_NOW} ${input.userMessage.trim()}`);

  return truncate(parts.join('\n\n'), MAX_PROMPT_CHARS);
}
