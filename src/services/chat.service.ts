import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';

import { db } from '@/firebaseConfig';

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
  const sections: string[] = [];
  if (connection) {
    sections.push(`[CONNECTION: ${connection.name}]\n${connection.contextSummary}`);
  }
  if (natalChartSummary) {
    sections.push(`[NATAL CHART]\n${natalChartSummary}`);
  }
  sections.push(`[QUESTION]\n${userMessage}`);
  const prompt = sections.length === 1 ? userMessage : sections.join('\n\n');

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
