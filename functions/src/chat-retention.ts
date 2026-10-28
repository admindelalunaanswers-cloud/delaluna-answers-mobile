/**
 * chat-retention.ts
 * Two clocks run on every chat turn:
 *
 *   - **User access — 60 days** (`CHAT_ACCESS_DAYS`). The user's own copies in
 *     `users/{uid}/savedChats` carry `expireAt`, and a Firestore TTL policy on
 *     that field removes them. The app also hides anything past the window
 *     itself, since TTL deletion can lag expiry by a day or more.
 *   - **Legal retention — 1,461 days** (`CHAT_ARCHIVE_DAYS`, four years
 *     including a leap day). Every answered turn is copied to the top-level
 *     `chatArchive` collection, which no client can read or write, and a TTL
 *     policy on `purgeAt` removes it at the end.
 *
 * The archive is deliberately *outside* `users/{uid}`, so neither the user
 * deleting a chat nor `delete-user-data` deleting the account reaches it.
 * Two things keep it outside the extension's reach, and both matter:
 *
 *   - The extension runs with ENABLE_AUTO_DISCOVERY=yes and
 *     AUTO_DISCOVERY_SEARCH_FIELDS=id,uid,userId (extensions/delete-user-data.env).
 *     It walks root collections and deletes any document whose id equals the
 *     uid or whose `id` / `uid` / `userId` field does. So the owner is stored
 *     as `ownerUid`, and the document id is `${uid}_${messageId}` — never the
 *     bare uid. Rename either and account deletion silently empties the archive.
 *   - Rules: the admin catch-all is read-only on `chatArchive`.
 *
 * What is kept is the conversation, not the prompt: the question, the reply,
 * reader, connection name and timestamps. The prompt embeds the natal chart
 * summary, connection birth context and the ~5.5KB persona — far more personal
 * data than the record needs, held for four years.
 *
 * The client mirrors CHAT_ACCESS_DAYS in `src/utils/chat-retention.ts`. Keep
 * the two in step.
 */

import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export const CHAT_ACCESS_DAYS = 60;
export const CHAT_ARCHIVE_DAYS = 1461;
export const CHAT_ARCHIVE_COLLECTION = "chatArchive";

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(ts: Timestamp, days: number): Timestamp {
  return Timestamp.fromMillis(ts.toMillis() + days * DAY_MS);
}

export function archiveDocId(uid: string, messageId: string): string {
  return `${uid}_${messageId}`;
}

type ChatData = FirebaseFirestore.DocumentData;

function chatMode(value: unknown): "astrology" | "tarot" | undefined {
  return value === "astrology" || value === "tarot" ? value : undefined;
}

/**
 * Copies one answered turn into the archive. Idempotent — keyed on the message,
 * so a redelivered event rewrites the same document.
 */
export async function archiveChatTurn(
  uid: string,
  messageId: string,
  data: ChatData,
): Promise<void> {
  const askedAt =
    data.createTime instanceof Timestamp ? data.createTime : Timestamp.now();

  const record: Record<string, unknown> = {
    // Not `uid` — see the header: delete-user-data auto-discovery matches it.
    ownerUid: uid,
    messageId,
    userMessage: String(data.userMessage ?? ""),
    response: String(data.response ?? ""),
    askedAt,
    answeredAt:
      data.generatedAt instanceof Timestamp
        ? data.generatedAt
        : FieldValue.serverTimestamp(),
    archivedAt: FieldValue.serverTimestamp(),
    purgeAt: addDays(askedAt, CHAT_ARCHIVE_DAYS),
  };
  const mode = chatMode(data.mode);
  if (mode) record.mode = mode;
  if (typeof data.connectionId === "string") record.connectionId = data.connectionId;
  if (typeof data.connectionName === "string") record.connectionName = data.connectionName;
  if (typeof data.model === "string") record.model = data.model;

  await admin
    .firestore()
    .collection(CHAT_ARCHIVE_COLLECTION)
    .doc(archiveDocId(uid, messageId))
    .set(record, { merge: true });
}

/**
 * When a saved chat stops being available to the user: 60 days after its most
 * recent turn, so a session never goes half-missing. Falls back to `savedAt`
 * for a session with no readable timestamps.
 */
export function savedChatExpireAt(data: ChatData): Timestamp | null {
  const times = ((data.messages ?? []) as ChatData[])
    .map((m) => m.createdAt)
    .filter((t): t is Timestamp => t instanceof Timestamp)
    .map((t) => t.toMillis());
  if (times.length) {
    return Timestamp.fromMillis(Math.max(...times) + CHAT_ACCESS_DAYS * DAY_MS);
  }
  return data.savedAt instanceof Timestamp
    ? addDays(data.savedAt, CHAT_ACCESS_DAYS)
    : null;
}

/**
 * The `savedChats` document the client's `saveChatAndClear` would have written
 * for these turns, or null if none of them was answered. Same shape, so the
 * history screen and resume treat it no differently.
 */
export function buildSavedSession(
  turns: { id: string; data: ChatData }[],
): ChatData | null {
  const completed = turns
    .filter(({ data }) => !!data.userMessage && !!data.response)
    .sort(
      (a, b) =>
        (a.data.createTime?.toMillis?.() ?? 0) -
        (b.data.createTime?.toMillis?.() ?? 0),
    );
  if (completed.length === 0) return null;

  const messages = completed.map(({ data }) => {
    const entry: ChatData = {
      userMessage: data.userMessage,
      response: data.response,
      createdAt:
        data.createTime instanceof Timestamp ? data.createTime : Timestamp.now(),
    };
    if (typeof data.connectionId === "string") entry.connectionId = data.connectionId;
    if (typeof data.connectionName === "string") entry.connectionName = data.connectionName;
    const mode = chatMode(data.mode);
    if (mode) entry.mode = mode;
    return entry;
  });

  const session: ChatData = {
    title: messages[0].userMessage,
    messages,
    savedAt: Timestamp.now(),
  };
  // The reader the thread was left in — what resuming puts the toggle back on.
  const lastMode = [...messages].reverse().find((m) => m.mode)?.mode;
  if (lastMode) session.mode = lastMode;
  session.expireAt = savedChatExpireAt(session);
  return session;
}
