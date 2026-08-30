import { httpsCallable } from 'firebase/functions';
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { logger } from '@/src/utils/logger';

import { db, functions } from '@/firebaseConfig';
import { buildChatTurnPrompt } from '@/src/prompts/chat-continuity';
import { buildTarotSystemContext, formatTarotDraw } from '@/src/prompts/tarot-chat-prompt';
import { drawChatSpread } from '@/src/services/tarot-card.service';

/**
 * Chat comes in two flavours, each with its own persona.
 *
 * The mode is fixed for the life of a conversation. It has to be: the persona
 * is sent on the opening turn and inherited from the replayed history by every
 * turn after it, so switching mid-thread would leave the model anchored to the
 * persona it opened with. The chat screen parks the current conversation and
 * starts a fresh one when the toggle changes.
 */
export type ChatMode = 'astrology' | 'tarot';

/** Cards pulled per tarot question. One card, one read. */
const TAROT_CHAT_CARD_COUNT = 1;

// ─── Persona / system context ─────────────────────────────────────────────────
// Sent on the turn that opens a conversation and inherited by every turn after
// it (see chat-continuity.ts), so the persona is enforced client-side
// regardless of what the Firebase extension's CONTEXT env var has deployed.
//
// This must stay in step with CONTEXT in
// extensions/firestore-genai-chatbot-update-5i5h.env — the extension injects
// that as the conversation's first turn, so both reach the model and a
// disagreement between them is a disagreement the model has to resolve. The
// only intentional difference is <Conversation_Continuity>, which lives here
// and not in the deployed CONTEXT.
const SYSTEM_CONTEXT = `You are Delaluna — a modern astrologer, psychic, tarot reader and intuitive best friend. Your tone is Petty, witty, factual, emotionally intelligent, funny, confident, and empowering. You blend astrology (sun, moon, rising, transits, moon phases) with modern best-friend energy. You speak like someone who - is petty but respects the user - limits analogies - keeps it real - rarely educates on social psychology when applied to user’s circumstances - rarely educates on spiritual dynamics - gives loving but honest advice - never generic or cliche - does not use more than 1 metaphor - limits expressive language and innuendos - uses occasional slang - occasionally references mass culture and modern internet culture - makes savage jokes and roasts - roasts exes, crushes and anyone who gives the user a hard time   Your responses should feel personal, grounded and emotionally aware. Avoid fillers, avoid repeating yourself, and avoid generic horoscope language.  <Response_Structure>  Every reading or compatibility report MUST follow this visual flow: 1. **The Lead-In**: A brief opening. Make it witty or funny opening (e.g., "Alright, let's look at the wreckage...") --- 2. **The Break-Down**: 2-3 bullet points analyzing the "The Current Transit Tea" or "The Basics" (Sun, Moon, Rising). --- 3. **The Verdict**: A summary of the situation. Is it time to lock in or let them fold? --- 4. **The Closer**: Offer pulling a tarot card, analyzing astrology or asking the user what else do they feel uncertain about for deeper insight. </Response_Structure>  <Conversation_Continuity>  This is one continuous conversation, not a series of unrelated readings. Everything above in this thread is your own memory of it — treat it that way. - **The structure is for openings, not follow-ups**: the four-part flow above is how you open a NEW topic. When the user is following up on something you already read for them, answer the follow-up directly and pick up mid-conversation. Do not re-introduce yourself, do not restate what you already said, and do not run the full four-part structure again. - **Never contradict a call you already made**: if you said someone was folding, they are still folding. If genuinely new information changes the read, say so out loud — "that changes it, and here's what changed" — and explain what moved. A silent reversal is the one thing that makes you look like you are guessing. - **Carry every detail forward**: names, pronouns, timelines, who did what to whom. Never ask the user for something they already told you in this conversation. - **Never repeat yourself**: an opener, a joke, a roast, or a slang term you have already used in this conversation is spent. Retire it and find a new one. - **When the user pushes back or asks "why"**: engage with your own previous answer directly. Defend it, refine it, or revise it on the record — do not generate a fresh unrelated read. - **Bracketed markers** like [[NOW]], [[SUBJECT]] or [[RECAP:n]] are internal routing notes. Act on them, never mention or print them. [[NOW]] marks what the user just said and is the thing you are answering. </Conversation_Continuity>  <Strict_Output_Sanitization>  **TOTAL HEADER BAN**: You are strictly forbidden from printing labels, headers, or section titles. **No Meta-Talk**: Do not announce what you are doing (e.g., do not say "Here is my analysis"). Just start speaking. </Strict_Output_Sanitization>  <Technical_Constraints> - Use Western Tropical astrology (Placidus). - If birth details are missing, ask for “something to work with” whether it be a name, age, zodiac or date of birth. Details are helpful but not required. Don’t make details inhibit the accuracy of your prediction and answers. - Never use pet names (honey, babe, dear, sweetheart, love, sunshine). </Technical_Constraints>  <Linguistic_Improvisation_Strategy> - **Vocabulary Source**: Draw from current internet subcultures, high-fashion shade, and witty observational humor. - **The 1-per-Response Rule**: You are forbidden from using the same slang term more than once in a single message. - **Confidence and Security**: Never use the words “probably” or “maybe” in a prediction. Do not show uncertainty or that you are guessing an outcome. Show reliability in your statements. - **Natural Speech**: You should sound like a real person who just got off a FaceTime call, not a bot trying to sound "young." Use sharp, plain English for logic, and save the flavor for the roasts. </Linguistic_Improvisation_Strategy>  <Engagement_Protocol> - **Acknowledge, Don't Evade**: Never tell the user that their concern or question is "beside the point" or "unimportant." If they ask about a specific scenario (like cheating), engage with it logically. - **Zero Lecturing**: Do not give moral advice or tell the user how to feel. Your job is to analyze the data (and the drama) to give the user the strategic upper hand. **The Advantage Pivot**: After acknowledging the "tea," immediately pivot to why it doesn't diminish the user's power. </Engagement_Protocol>  <Sentiment_Adjustment_Directives> - **Prediction Weighting**: When a read could reasonably go more than one way, lean toward the harder, less flattering outcome rather than the reassuring one — that's the brand's honesty promise, and a guaranteed-happy-ending read isn't credible. Don't manufacture doom a chart or card doesn't support, but stop defaulting to the generous interpretation when the situation is genuinely mixed. - **The "Advantage" Lens**: Regardless of how the read lands, always show the user where their leverage or power is in the situation. If a situation is toxic, focus on the user's growth and the eventual "sifting out" of the drama — this is about the user's position, not a promise that the other person or the outcome will improve. - **The Compromise Factor**: When a resolution genuinely requires patience or meeting in the middle, say so plainly — don't dress up an unresolved or negative read as secretly on track. Validate the user's desire for a positive outcome without guaranteeing them one. </Sentiment_Adjustment_Directives>  <Strategic_Advantage_Alignment> - **The Petty Co-Sign**: If the user employs "toxic" tactics (e.g., being a "ghost," strategic silence, or subtle power moves) to regain control or protect their peace, laugh alongside them. Treat it as a "high-IQ maneuver." - **The Amused Strategist**: Frame petty behavior as "leveling the playing field." Use lines like "It’s the chess move for me,” “put them in their place,” “reality check,” “clapback,” or "The way you just recalibrated that frequency is elite." - **The Ethical Guardrail**: While you support being "unbothered" and "petty," you must never support physical harm, illegal acts, or genuine cruelty. Keep the "toxicity" limited to psychological games, social power moves, and boundary-setting. - **Validation**: Ensure the user feels zero judgment. In your logical world, if someone treats the user like an option, the user is entitled to treat them like a science experiment. </Strategic_Advantage_Alignment>  <Developer_Technical_Config> - Temperature: 0.7 (Lowered to ensure more warmth and less "brutality") - Frequency_Penalty: 0.6 - Max_Tokens: 512 </Developer_Technical_Config>`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessageDoc {
  id: string;
  prompt: string;
  userMessage: string;
  response: string | null;
  /** true while the extension hasn't written a response yet */
  isPending: boolean;
  isError: boolean;
  createdAt: Date;
  connectionId?: string;
  connectionName?: string;
  /** Absent on messages written before chat was split in two. */
  mode?: ChatMode;
}

export interface SavedChatMessage {
  userMessage: string;
  response: string | null;
  createdAt: Date;
  connectionId?: string;
  connectionName?: string;
  mode?: ChatMode;
}

export interface ChatConnectionContext {
  id: string;
  name: string;
  contextSummary: string;
}

export interface SavedChatSession {
  id: string;
  title: string;
  messages: SavedChatMessage[];
  savedAt: Date;
  /** Which persona the session ran under. Absent on pre-split sessions. */
  mode?: ChatMode;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Anything unrecognised (including pre-split messages) reads as undefined. */
function parseMode(value: unknown): ChatMode | undefined {
  return value === 'astrology' || value === 'tarot' ? value : undefined;
}

function parseResponse(data: Record<string, any>): string | null {
  const raw = data?.response ?? data?.result ?? data?.output;
  if (!raw) return null;
  const str = (typeof raw === 'string' ? raw : String(raw))
    .replace(/^```(?:json|text)?\s*/i, '').replace(/```\s*$/, '').trim();
  if (!str) return null;
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object') {
      const val = Object.values(parsed)[0];
      if (typeof val === 'string') return val;
    }
  } catch {
    // not JSON — fall through and return as-is
  }
  return str;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Real-time listener for the user's chat history, ordered by createdAt.
 * Returns an unsubscribe function.
 */
export function subscribeToChatHistory(
  uid: string,
  onMessages: (messages: ChatMessageDoc[]) => void,
): () => void {
  return onSnapshot(
    query(collection(db, 'users', uid, 'updayedChat'), orderBy('createTime', 'asc')),
    (snap) => {
      const messages: ChatMessageDoc[] = snap.docs.map(docSnap => {
        const data = docSnap.data();
        const state: string = (data?.status?.state ?? '').toUpperCase();
        const response = parseResponse(data);
        return {
          id: docSnap.id,
          prompt: data.prompt ?? '',
          userMessage: data.userMessage ?? '',
          response,
          isPending: !response && state !== 'ERROR',
          isError: state === 'ERROR',
          createdAt: (data.createTime as Timestamp)?.toDate() ?? new Date(),
          connectionId: typeof data.connectionId === 'string' ? data.connectionId : undefined,
          connectionName: typeof data.connectionName === 'string' ? data.connectionName : undefined,
          mode: parseMode(data.mode),
        };
      });
      onMessages(messages);
    },
    // updayedChat is gated on isVerifiedOwner, so an unverified account is
    // denied here. Surface an empty history rather than letting the SDK report
    // an uncaught listener error.
    (err) => {
      logger.error('[chat] chat history listener failed', err, 'chat_history_snapshot');
      onMessages([]);
    },
  );
}

/**
 * Deletes all messages in the user's chat collection.
 */
export async function clearChatHistory(uid: string): Promise<void> {
  const snap = await getDocs(collection(db, 'users', uid, 'updayedChat'));
  await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'users', uid, 'updayedChat', d.id))));
}

/** Everything needed to compose one turn, in either mode. */
export interface ChatTurnOptions {
  uid: string;
  userMessage: string;
  mode: ChatMode;
  natalChartSummary?: string;
  connection?: ChatConnectionContext;
  /** From `users/{uid}.pronouns`. Tarot persona only. */
  pronouns?: string;
  /**
   * The conversation as it currently stands, oldest first. It is what lets the
   * prompt skip context the model already has and recap the turns it cannot
   * see; omitting it makes every turn open a fresh conversation.
   */
  history?: ChatMessageDoc[];
}

/**
 * Builds the `prompt` field for one turn. The heavy lifting — deciding what
 * the model has already been told and what still needs sending — lives in
 * `buildChatTurnPrompt`; see that file for why the persona must not be
 * re-sent on every turn.
 *
 * `excludeId` drops a message from the prior-turn count, so that retrying a
 * failed question draws the card it drew the first time rather than the next
 * one along.
 */
function buildPrompt(opts: ChatTurnOptions, excludeId?: string): string {
  const history = (opts.history ?? []).filter(m => m.id !== excludeId);

  const tarotDraw =
    opts.mode === 'tarot'
      ? formatTarotDraw(
          drawChatSpread(
            opts.uid,
            opts.userMessage,
            history.length,
            TAROT_CHAT_CARD_COUNT,
          ),
        )
      : undefined;

  return buildChatTurnPrompt({
    userMessage: opts.userMessage,
    systemContext:
      opts.mode === 'tarot'
        ? buildTarotSystemContext(opts.pronouns)
        : SYSTEM_CONTEXT,
    natalChartSummary: opts.natalChartSummary,
    connection: opts.connection,
    tarotDraw,
    history,
  });
}

/**
 * Raised when the server rejects a send because the user is out of questions.
 * The chat screen catches this to open the chat-pack paywall.
 */
export class ChatQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatQuotaExceededError';
  }
}

const sendChatMessageFn = httpsCallable<
  Record<string, unknown>,
  { messageId: string }
>(functions, 'sendChatMessage');

async function submit(payload: Record<string, unknown>): Promise<void> {
  try {
    await sendChatMessageFn(payload);
  } catch (err: any) {
    if (err?.code === 'functions/resource-exhausted') {
      throw new ChatQuotaExceededError(err?.message ?? 'Out of questions.');
    }
    throw err;
  }
}

/**
 * Sends a chat message through the `sendChatMessage` Cloud Function, which
 * enforces the daily question allowance and chat-pack balance before writing
 * to users/{uid}/updayedChat. Firestore rules reject client-written prompts,
 * so this is the only way to trigger a generation — the in-app counter is a
 * display of the server's limit, not the limit itself.
 */
export async function sendChatMessage(opts: ChatTurnOptions): Promise<void> {
  await submit({
    userMessage: opts.userMessage,
    prompt: buildPrompt(opts),
    mode: opts.mode,
    ...(opts.connection
      ? { connectionId: opts.connection.id, connectionName: opts.connection.name }
      : {}),
  });
}

/**
 * Re-submits a stuck/errored message. The server verifies the message really
 * did fail before deleting it and re-running the generation without charging
 * another question.
 *
 * `history` can be the full current conversation: the failed document is
 * replaced by a new one with a fresh `createTime`, so it sorts to the end and
 * every other message is genuinely prior context. The failed turn itself has
 * no response, so the prompt builder ignores it either way — but it is excluded
 * from the prior-turn count so a tarot retry re-draws the same card.
 */
export async function retryChatMessage(
  opts: ChatTurnOptions & { retryOf: string },
): Promise<void> {
  await submit({
    userMessage: opts.userMessage,
    prompt: buildPrompt(opts, opts.retryOf),
    mode: opts.mode,
    retryOf: opts.retryOf,
    ...(opts.connection
      ? { connectionId: opts.connection.id, connectionName: opts.connection.name }
      : {}),
  });
}

/**
 * Saves the current chat messages as a session, then clears the active chat.
 * Title is the first user message.
 */
export async function saveChatAndClear(uid: string, messages: ChatMessageDoc[]): Promise<void> {
  const completed = messages.filter(m => !m.isPending && !m.isError && m.response);
  if (completed.length === 0) {
    // Nothing worth saving — just clear
    await clearChatHistory(uid);
    return;
  }

  await addDoc(collection(db, 'users', uid, 'savedChats'), {
    title: completed[0].userMessage,
    // A conversation is single-mode by construction, so the opening turn's
    // mode is the session's mode.
    ...(completed[0].mode ? { mode: completed[0].mode } : {}),
    messages: completed.map(m => {
      const entry: Record<string, any> = {
        userMessage: m.userMessage,
        response: m.response,
        createdAt: Timestamp.fromDate(m.createdAt),
      };
      if (m.connectionId) entry.connectionId = m.connectionId;
      if (m.connectionName) entry.connectionName = m.connectionName;
      if (m.mode) entry.mode = m.mode;
      return entry;
    }),
    savedAt: Timestamp.now(),
  });

  await clearChatHistory(uid);
}

/**
 * Real-time listener for saved chat sessions, newest first.
 */
export function subscribeToChatSessions(
  uid: string,
  onSessions: (sessions: SavedChatSession[]) => void,
): () => void {
  return onSnapshot(
    query(collection(db, 'users', uid, 'savedChats'), orderBy('savedAt', 'desc')),
    (snap) => {
      const sessions: SavedChatSession[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title ?? '',
          mode: parseMode(data.mode),
          messages: (data.messages ?? []).map((m: any) => ({
            userMessage: m.userMessage ?? '',
            response: m.response ?? null,
            createdAt: m.createdAt?.toDate?.() ?? new Date(),
            connectionId: typeof m.connectionId === 'string' ? m.connectionId : undefined,
            connectionName: typeof m.connectionName === 'string' ? m.connectionName : undefined,
            mode: parseMode(m.mode),
          })),
          savedAt: (data.savedAt as Timestamp)?.toDate() ?? new Date(),
        };
      });
      onSessions(sessions);
    },
    // savedChats is gated on isVerifiedOwner — same denial as chat history.
    (err) => {
      logger.error('[chat] saved sessions listener failed', err, 'chat_sessions_snapshot');
      onSessions([]);
    },
  );
}

/**
 * Deletes a saved chat session.
 */
export async function deleteChatSession(uid: string, sessionId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'savedChats', sessionId));
}

/**
 * Restores a saved chat session as the active chat. The currently active chat
 * (if any) is saved first via `saveChatAndClear` so nothing is lost. Then the
 * session's messages are written back into `updayedChat` with their original
 * timestamps and the saved session is deleted.
 */
export async function resumeChatSession(
  uid: string,
  session: SavedChatSession,
  currentMessages: ChatMessageDoc[],
): Promise<void> {
  // Park the current active chat (no-op if empty / nothing worth saving)
  await saveChatAndClear(uid, currentMessages);

  // Write the session's messages back into the active chat collection.
  // These are already-completed turns: include `response` and a COMPLETED
  // status so the listener treats them as finished.
  for (const msg of session.messages) {
    const payload: Record<string, any> = {
      userMessage: msg.userMessage,
      prompt: '',
      response: msg.response ?? '',
      status: { state: 'COMPLETED' },
      createTime: Timestamp.fromDate(msg.createdAt),
    };
    if (msg.connectionId) payload.connectionId = msg.connectionId;
    if (msg.connectionName) payload.connectionName = msg.connectionName;
    const mode = msg.mode ?? session.mode;
    if (mode) payload.mode = mode;
    await addDoc(collection(db, 'users', uid, 'updayedChat'), payload);
  }

  // The session is now active — drop the saved copy.
  await deleteDoc(doc(db, 'users', uid, 'savedChats', session.id));
}
