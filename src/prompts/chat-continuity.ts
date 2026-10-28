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
 *    a conversation, and inherited by every turn after it — the sole exception
 *    being a reader switch, see (3).
 *
 * 2. **A turn with an empty `prompt` or an empty `response` is skipped
 *    entirely** (`messagesToApi` drops it). Restored sessions are written by
 *    `resumeChatSession` with `prompt: ''` — Firestore rules require that, so
 *    that a client cannot trigger a billable generation — which means the model
 *    cannot see a single turn of a resumed conversation even though the user is
 *    looking at all of it. That gap is closed here with an explicit recap.
 *
 * 3. **Both readers share one thread.** The astrology and tarot personas are
 *    two voices on the same conversation, not two conversations — the user can
 *    switch between them mid-thread and expects the reader that picks up to
 *    remember everything the other one just said. Because of (1), a switch is
 *    the one moment the persona has to go out again: the model is anchored to
 *    whichever persona the replayed history last carried, and nothing else
 *    would move it. `[[READER:x]]` rides along with the persona so a later turn
 *    can tell which voice the thread is currently in, and `[[READER_CHANGE]]`
 *    hands the conversation over — new instructions, same memory — rather than
 *    letting the fresh persona read as a fresh start. Because each switch
 *    leaves another persona copy in the replay, they are budgeted:
 *    `MAX_READER_SWITCHES` below.
 *
 * Everything is marked with `[[BRACKET]]` tokens rather than headings on their
 * own lines, because `sanitizePrompt` in the Cloud Function may collapse the
 * layout; the markers survive whitespace collapsing and are also what lets a
 * later turn detect what an earlier turn already said.
 */

/**
 * Which persona answers a turn.
 *
 * Both modes ride the same collection *and the same conversation*: the mode is
 * a property of the turn, not of the thread. `chat.service.ts` re-exports this,
 * which is where the rest of the app imports it from.
 */
export type ChatMode = 'astrology' | 'tarot';

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
  /**
   * The persona. Sent on the turn that opens a conversation and on any turn
   * that switches reader — otherwise inherited from the replayed history.
   */
  systemContext: string;
  /**
   * Whose voice this turn is in. Omitted reads as `astrology`, which is what
   * every turn written before chat had two readers was.
   */
  mode?: ChatMode;
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
const MARK_READER = '[[READER:';
const MARK_READER_CHANGE = '[[READER_CHANGE]]';
const READER_PATTERN = /\[\[READER:(astrology|tarot)\]\]/;
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
// a transcript, so only the last few turns are kept and their replies share a
// fixed budget. Sharing it matters: a flat per-reply cap kept only the opening
// of a long reply even when it was the only turn restored, so the model could
// not see, say, the quote it closed on and denied ever giving one.
const MAX_RECAP_TURNS = 6;
const MIN_RECAP_REPLY_CHARS = 320;
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

/**
 * How many reader switches one conversation may carry.
 *
 * Every switch re-sends a persona (~5.5KB), and consequence (1) means each one
 * is then replayed on every later turn in the *user* role, forever. Three
 * handovers is four copies — around 22KB of instruction, at which point the
 * personas start to out-weigh the conversation they are supposed to be about,
 * and the most recent copy is no longer obviously the newest thing the model
 * read. Prompt text cannot fix that: telling the model harder which copy wins
 * is itself another copy. So the count is capped instead, and the switch that
 * would exceed it starts a fresh conversation.
 *
 * The cap is enforced by the chat screen, which is the only thing that can ask
 * the user first — this module just defines what a switch is and counts them,
 * so both halves agree.
 */
export const MAX_READER_SWITCHES = 3;

/**
 * How many reader handovers the model will be replayed on the next turn.
 *
 * Only turns the extension actually replays are counted: a failed turn is
 * never re-sent, and a restored session's turns carry no prompt at all, so
 * neither leaves a persona copy behind. A resume therefore resets the budget,
 * which is right — the replay it resets to is empty.
 */
export function readerSwitchesUsed(history: ContinuityTurn[]): number {
  return history.filter(
    turn => isVisibleToModel(turn) && turn.prompt.includes(MARK_READER_CHANGE),
  ).length;
}

/** How the switch note names each reader. */
const READER_LABEL: Record<ChatMode, string> = {
  astrology: 'the astrologer',
  tarot: 'the tarot reader',
};

/**
 * Which persona the replayed history has the model speaking in, or null when
 * it has none yet.
 *
 * The reader marker travels with the persona, so it is written exactly on the
 * turns where the anchor moves — the one that opens a conversation and every
 * one that switches. Scanning back to the most recent marker therefore names
 * the voice the model is currently in, without every turn having to carry one.
 */
function lastReader(visible: ContinuityTurn[]): ChatMode | null {
  for (let i = visible.length - 1; i >= 0; i--) {
    const match = visible[i].prompt.match(READER_PATTERN);
    if (match) return match[1] as ChatMode;
    // Turns written before the marker existed carry no reader, but a tarot one
    // always carried a draw. Those threads are single-mode by construction, so
    // the first draw found scanning back describes all of them.
    if (visible[i].prompt.includes(MARK_CARD)) return 'tarot';
  }
  return visible.length > 0 ? 'astrology' : null;
}

/** Who the most recent model-visible turn was about, or null for nobody. */
function lastSubjectId(visible: ContinuityTurn[]): string | null {
  return visible.length > 0 ? visible[visible.length - 1].connectionId ?? null : null;
}

function buildRecap(restored: ContinuityTurn[], visible: ContinuityTurn[]): string | null {
  if (restored.length === 0) return null;
  // Already covered by an earlier turn, which the extension replays for us.
  if (restored.length <= recappedCount(visible)) return null;

  const kept = restored.slice(-MAX_RECAP_TURNS);
  const leads = kept.map(turn => `User: ${collapse(turn.userMessage)} → You: `);
  const overhead = leads.reduce((sum, lead) => sum + lead.length, 0) + ' || '.length * (kept.length - 1);
  const replyBudget = Math.max(
    MIN_RECAP_REPLY_CHARS,
    Math.floor((MAX_RECAP_CHARS - overhead) / kept.length),
  );

  const body = truncate(
    kept
      .map((turn, i) => leads[i] + truncate(collapse(turn.response ?? ''), replyBudget))
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
 * already been told is added to a given turn. Switching reader is the one
 * thing that re-sends the persona, and it hands the conversation over rather
 * than reopening it.
 */
export function buildChatTurnPrompt(input: ChatTurnInput): string {
  const history = input.history ?? [];
  const visible = history.filter(isVisibleToModel);
  const restored = history.filter(isRestored);

  // "Anchored" = at least one earlier turn will be replayed, so the persona
  // and anything else that turn carried is already in the model's context.
  const anchored = visible.length > 0;

  const mode = input.mode ?? 'astrology';
  const previousReader = lastReader(visible);
  // Only a reader the model is actually anchored to can be switched away from:
  // an unanchored turn is opening the conversation, not handing it over.
  const switchedFrom =
    anchored && previousReader && previousReader !== mode ? previousReader : null;

  const parts: string[] = [];

  if (!anchored || switchedFrom) {
    parts.push(`${MARK_READER}${mode}]] ${input.systemContext.trim()}`);
  }

  if (switchedFrom) {
    parts.push(
      `${MARK_READER_CHANGE} The user has switched readers mid-conversation, from ` +
        `${READER_LABEL[switchedFrom]} to ${READER_LABEL[mode]}. The instructions directly above ` +
        `are the ones that apply from here on and they replace any earlier reader instructions ` +
        `in this thread. Everything else above is still your own memory of this same ` +
        `conversation: keep the names, the timelines and the calls you already made, do not ` +
        `re-introduce yourself, and do not start the conversation over. ` +
        (mode === 'tarot'
          ? `The spread under ${MARK_CARD} was pulled for this question — read it fresh, and ` +
            `let it speak to what has already been said.`
          : `Stop pulling cards. Answer from the chart and the transits, and stand behind any ` +
            `read the cards already gave.`),
    );
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

  // Every card here is on screen next to the answer, so one the reader never
  // names reads as a bug to the user. The persona says the same thing, but it
  // is only sent on the opening turn — this line rides every tarot turn.
  if (input.tarotDraw?.trim()) {
    parts.push(
      `${MARK_CARD} The spread drawn for this question, in order — the user can see all of ` +
        `these cards, so name every one of them in your read: ${input.tarotDraw.trim()}`,
    );
  }

  parts.push(`${MARK_NOW} ${input.userMessage.trim()}`);

  return truncate(parts.join('\n\n'), MAX_PROMPT_CHARS);
}
