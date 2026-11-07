# Chat retention

Held off `development` on 2026-10-30 until the Privacy Policy discloses it; this branch
(`feat/chat-retention`) restores it. These two sections were in the local `CLAUDE.md` —
put them back there when this merges.

## Chat retention: 60 days for the user, 1,461 for the record

Two clocks, both in `functions/src/chat-retention.ts` (client mirror of the first:
`src/utils/chat-retention.ts` — keep them in step):

- **60 days of user access.** A saved chat's `expireAt` is its *last* turn + 60 days,
  stamped server-side by `stampSavedChatExpiry` (overwriting anything a client sends). A
  TTL policy on `savedChats.expireAt` removes it; the app also filters past-window chats
  in `subscribeToChatSessions`, because TTL deletion lags expiry by up to a day or more.
- **1,461 days of legal retention.** `archiveChatReply` copies every answered turn
  (question, reply, mode, connection, timestamps, model — **not** the prompt) to the
  top-level `chatArchive/{uid}_{messageId}`, `purgeAt` = asked-at + 1,461 days, removed by
  a TTL policy. No client can touch it; the admin catch-all is read-only there.

The archive survives the user deleting a chat **and deleting their account** — the
Privacy Policy (v.2026.11.04) says chat transcripts may be kept in archive storage for four
years even after the account is deleted. The four-year `purgeAt` TTL is what removes them.
Note `delete-user-data` would not find these records anyway (owner field `ownerUid`, doc id
`${uid}_${messageId}`), so keeping them needs no extra work. (From 2026-10-30 to the
revert on `fix/keep-chat-archive`, `purgeChatArchiveOnAccountDelete` deleted them with the
account; production still runs it until it is deleted — see the deploy steps.)

`clearDailyChatHistory` used to *delete* open-thread turns older than 24h — anything not
parked with "+" before midnight UTC was lost. It now moves them into `savedChats` (one
session per user per night) and then clears them, so the chat screen still starts fresh
daily but nothing leaves the user's history before 60 days.

## TODO — chat retention rollout (order matters)

- [x] **Update the Privacy Policy.** Counsel's v.2026.11.04 discloses the 60-day window
      and the four-year archive, including after account deletion, and drops the claim
      that deleting the app deletes your data (`docs/privacy-policy-2026-11-04`). Ship it
      before or with this deploy.
- [ ] **Deploy in this order, on `testing` first:**
      1. `firebase deploy --only functions` — starts archiving new answers, and the nightly
         job starts parking instead of deleting.
      2. `node scripts/backfill-chat-retention.js --project <env> --commit` — archives
         existing chats and stamps `expireAt`. **Must precede step 3:** the TTL policy
         deletes saved chats already past 60 days the moment it is live, and anything not
         yet archived goes with it. (The script is local only — `/scripts/*` is
         gitignored.)
      3. `firebase deploy --only firestore:indexes` — enables both TTL policies.
      4. In production, `firebase functions:delete purgeChatArchiveOnAccountDelete
         --project delaluna-answers` — a functions deploy from a branch without it will
         also offer to delete it; say yes.
      4. `firebase deploy --only firestore:rules` — admin read-only on `chatArchive`.
      5. Ship the client (OTA is fine for this part — no native change).
- [ ] **Confirm both TTL policies show "Serving"** in the console (Firestore → Time-to-live)
      after step 3; creation takes minutes to hours.
