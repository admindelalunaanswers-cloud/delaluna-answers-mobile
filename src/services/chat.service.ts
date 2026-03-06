import { addDoc, collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';

import { db } from '@/firebaseConfig';
import { buildChatPrompt } from '@/src/prompts/chat-prompt';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessageDoc {
  id: string;
  userMessage: string;
  response: string | null;
  /** true while the extension hasn't written a response yet */
  isPending: boolean;
  isError: boolean;
  createdAt: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseResponse(data: Record<string, any>): string | null {
  const raw = data?.response ?? data?.result ?? data?.output;
  if (!raw) return null;
  const str = typeof raw === 'string' ? raw : String(raw);
  return str.replace(/^```(?:json|text)?\s*/i, '').replace(/```\s*$/, '').trim() || null;
}

function buildNatalChartSummary(chart: NatalChartDetailsDoc): string {
  return JSON.stringify({
    planets: chart.planets.map(p => ({
      name: p.name,
      sign: p.sign,
      house: p.house,
      isRetrograde: p.isRetrograde,
    })),
    ascendant: { sign: chart.ascendant.sign, degree: chart.ascendant.degree },
    midheaven: { sign: chart.midheaven.sign, degree: chart.midheaven.degree },
  });
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
    query(collection(db, 'users', uid, 'chat'), orderBy('createdAt', 'asc')),
    (snap) => {
      const messages: ChatMessageDoc[] = snap.docs.map(docSnap => {
        const data = docSnap.data();
        const state: string = (data?.status?.state ?? '').toUpperCase();
        const response = parseResponse(data);
        return {
          id: docSnap.id,
          userMessage: data.userMessage ?? '',
          response,
          isPending: !response && state !== 'ERROR',
          isError: state === 'ERROR',
          createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
        };
      });
      onMessages(messages);
    },
  );
}

/**
 * Sends a chat message by writing a document to users/{uid}/chat.
 * The Firebase Extension reads the `prompt` field and writes back `response`.
 */
export async function sendChatMessage(
  uid: string,
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  chart: NatalChartDetailsDoc | null,
): Promise<void> {
  const natalChartSummary = chart
    ? buildNatalChartSummary(chart)
    : 'No natal chart available.';

  const prompt = buildChatPrompt(natalChartSummary, history, userMessage);

  await addDoc(collection(db, 'users', uid, 'chat'), {
    userMessage,
    prompt,
    createdAt: Timestamp.now(),
    requestedAt: Timestamp.now(),
  });
}

/**
 * Builds the conversation history array from completed messages,
 * for inclusion in the next message's prompt.
 */
export function buildHistory(
  messages: ChatMessageDoc[],
): { role: 'user' | 'assistant'; content: string }[] {
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const msg of messages) {
    history.push({ role: 'user', content: msg.userMessage });
    if (msg.response) {
      history.push({ role: 'assistant', content: msg.response });
    }
  }
  return history;
}
