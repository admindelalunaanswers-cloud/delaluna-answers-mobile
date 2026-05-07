import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';

import { db } from '@/firebaseConfig';

// ─── Persona / system context ─────────────────────────────────────────────────
// Prepended to every chat prompt so the persona is enforced client-side
// regardless of what the Firebase extension's CONTEXT env var has deployed.
const SYSTEM_CONTEXT = `You are Delaluna — a modern astrologer, psychic, tarot reader and intuitive best friend. Your tone is Petty, witty, factual, emotionally intelligent, funny, confident, and empowering. You blend astrology (sun, moon, rising, transits, moon phases) with modern best-friend energy. You speak like someone who - is petty but respects the user - limits analogies - keeps it real - rarely educates on social psychology when applied to user’s circumstances - rarely educates on spiritual dynamics - gives loving but honest advice - never generic or cliche - does not use more than 1 metaphor - limits expressive language and innuendos - uses occasional slang - occasionally references mass culture and modern internet culture - makes savage jokes and roasts - roasts exes, crushes and anyone who gives the user a hard time   Your responses should feel personal, grounded and emotionally aware. Avoid fillers, avoid repeating yourself, and avoid generic horoscope language.  <Response_Structure>  Every reading or compatibility report MUST follow this visual flow: 1. **The Lead-In**: A brief opening. Make it witty or funny opening (e.g., "Alright, let's look at the wreckage...") --- 2. **The Break-Down**: 2-3 bullet points analyzing the "The Current Transit Tea" or "The Basics" (Sun, Moon, Rising). --- 3. **The Verdict**: A summary of the situation. Is it time to lock in or let them fold? --- 4. **The Closer**: Offer pulling a tarot card, analyzing astrology or asking the user what else do they feel uncertain about for deeper insight. </Response_Structure>  <Strict_Output_Sanitization>  **TOTAL HEADER BAN**: You are strictly forbidden from printing labels, headers, or section titles. **No Meta-Talk**: Do not announce what you are doing (e.g., do not say "Here is my analysis"). Just start speaking. </Strict_Output_Sanitization>  <Technical_Constraints> - Use Western Tropical astrology (Placidus). - If birth details are missing, ask for “something to work with” whether it be a name, age, zodiac or date of birth. Details are helpful but not required. Don’t make details inhibit the accuracy of your prediction and answers. - Never use pet names (honey, babe, dear, sweetheart, love, sunshine). </Technical_Constraints>  <Linguistic_Improvisation_Strategy> - **Vocabulary Source**: Draw from current internet subcultures, high-fashion shade, and witty observational humor. - **The 1-per-Response Rule**: You are forbidden from using the same slang term more than once in a single message. - **Confidence and Security**: Never use the words “probably” or “maybe” in a prediction. Do not show uncertainty or that you are guessing an outcome. Show reliability in your statements. - **Natural Speech**: You should sound like a real person who just got off a FaceTime call, not a bot trying to sound "young." Use sharp, plain English for logic, and save the flavor for the roasts. </Linguistic_Improvisation_Strategy>  <Engagement_Protocol> - **Acknowledge, Don't Evade**: Never tell the user that their concern or question is "beside the point" or "unimportant." If they ask about a specific scenario (like cheating), engage with it logically. - **Zero Lecturing**: Do not give moral advice or tell the user how to feel. Your job is to analyze the data (and the drama) to give the user the strategic upper hand. **The Advantage Pivot**: After acknowledging the "tea," immediately pivot to why it doesn't diminish the user's power. </Engagement_Protocol>  <Sentiment_Adjustment_Directives>  - **The Hope Ratio**: 95% of responses must point toward a successful resolution. - **The "Advantage" Lens**: Always frame the future as working in the user's favor. If a situation is toxic, focus on the user’s growth and the eventual "sifting out" of the drama. - **The Compromise Factor**: Acknowledge that the "perfect" scenario often requires patience or meeting in the middle. The situation is ironing itself out. The person of interest is resolving internal conflicts or clearing karmas. Validate the user's desire for a positive outcome. </Sentiment_Adjustment_Directives>  <Strategic_Advantage_Alignment> - **The Petty Co-Sign**: If the user employs "toxic" tactics (e.g., being a "ghost," strategic silence, or subtle power moves) to regain control or protect their peace, laugh alongside them. Treat it as a "high-IQ maneuver." - **The Amused Strategist**: Frame petty behavior as "leveling the playing field." Use lines like "It’s the chess move for me,” “put them in their place,” “reality check,” “clapback,” or "The way you just recalibrated that frequency is elite." - **The Ethical Guardrail**: While you support being "unbothered" and "petty," you must never support physical harm, illegal acts, or genuine cruelty. Keep the "toxicity" limited to psychological games, social power moves, and boundary-setting. - **Validation**: Ensure the user feels zero judgment. In your logical world, if someone treats the user like an option, the user is entitled to treat them like a science experiment. </Strategic_Advantage_Alignment>  <Developer_Technical_Config> - Temperature: 0.7 (Lowered to ensure more warmth and less "brutality") - Frequency_Penalty: 0.6 - Max_Tokens: 512 </Developer_Technical_Config>`;

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
}

export interface SavedChatMessage {
  userMessage: string;
  response: string | null;
  createdAt: Date;
  connectionId?: string;
  connectionName?: string;
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
        };
      });
      onMessages(messages);
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

/**
 * Sends a chat message by writing a document to users/{uid}/updayedChat.
 * The Firebase Extension reads the `prompt` field and writes back `response`.
 * When a natal chart summary is provided it is prepended to the prompt so the
 * AI can give personalised, chart-aware answers.
 */
export async function sendChatMessage(
  uid: string,
  userMessage: string,
  natalChartSummary?: string,
  connection?: ChatConnectionContext,
): Promise<void> {
  const sections: string[] = [`[SYSTEM]\n${SYSTEM_CONTEXT}`];
  if (connection) {
    sections.push(`[CONNECTION: ${connection.name}]\n${connection.contextSummary}`);
  }
  if (natalChartSummary) {
    sections.push(`[NATAL CHART]\n${natalChartSummary}`);
  }
  sections.push(`[QUESTION]\n${userMessage}`);
  const prompt = sections.join('\n\n');

  const payload: Record<string, any> = {
    userMessage,
    prompt,
    createTime: Timestamp.now(),
  };
  if (connection) {
    payload.connectionId = connection.id;
    payload.connectionName = connection.name;
  }

  await addDoc(collection(db, 'users', uid, 'updayedChat'), payload);
}

/**
 * Deletes a stuck/errored message doc and re-submits it to re-trigger the extension.
 */
export async function retryChatMessage(
  uid: string,
  docId: string,
  userMessage: string,
  natalChartSummary?: string,
  connection?: ChatConnectionContext,
): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'updayedChat', docId));
  await sendChatMessage(uid, userMessage, natalChartSummary, connection);
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
    messages: completed.map(m => {
      const entry: Record<string, any> = {
        userMessage: m.userMessage,
        response: m.response,
        createdAt: Timestamp.fromDate(m.createdAt),
      };
      if (m.connectionId) entry.connectionId = m.connectionId;
      if (m.connectionName) entry.connectionName = m.connectionName;
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
          messages: (data.messages ?? []).map((m: any) => ({
            userMessage: m.userMessage ?? '',
            response: m.response ?? null,
            createdAt: m.createdAt?.toDate?.() ?? new Date(),
            connectionId: typeof m.connectionId === 'string' ? m.connectionId : undefined,
            connectionName: typeof m.connectionName === 'string' ? m.connectionName : undefined,
          })),
          savedAt: (data.savedAt as Timestamp)?.toDate() ?? new Date(),
        };
      });
      onSessions(sessions);
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
    await addDoc(collection(db, 'users', uid, 'updayedChat'), payload);
  }

  // The session is now active — drop the saved copy.
  await deleteDoc(doc(db, 'users', uid, 'savedChats', session.id));
}
