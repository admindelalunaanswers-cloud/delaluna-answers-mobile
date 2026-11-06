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

The archive survives the user deleting a chat, but **not their account**: since
2026-10-30, `purgeChatArchiveOnAccountDelete` (an Auth `onDelete` trigger, on
`development` already) deletes every record whose `ownerUid` matches. It is needed
because the owner field is `ownerUid` and the doc id is never the bare uid, so
`delete-user-data`'s auto-discovery on `id,uid,userId` never finds these records.
(Before that the archive was meant to outlive the account; that was reversed.)

`clearDailyChatHistory` used to *delete* open-thread turns older than 24h — anything not
parked with "+" before midnight UTC was lost. It now moves them into `savedChats` (one
session per user per night) and then clears them, so the chat screen still starts fresh
daily but nothing leaves the user's history before 60 days.

## TODO — chat retention rollout (order matters)

- [ ] **Update the Privacy Policy before shipping.** Play Data safety was updated
      2026-10-29, but the policy (v2026.10.21 — `src/assets/legal/Privacy_Policy.md`, the
      in-app copy in `legal-texts.ts`, and the PDF) still promises deletion on request
      "except to the extent we are required by law to retain", says nothing about the
      60-day window or the four-year chat record, and
      states that deleting the app deletes your data. (A draft is on
      `docs/privacy-policy-retention`.)
- [ ] **Deploy in this order, on `testing` first:**
      1. `firebase deploy --only functions` — starts archiving new answers, and the nightly
         job starts parking instead of deleting.
      2. `node scripts/backfill-chat-retention.js --project <env> --commit` — archives
         existing chats and stamps `expireAt`. **Must precede step 3:** the TTL policy
         deletes saved chats already past 60 days the moment it is live, and anything not
         yet archived goes with it. (The script is local only — `/scripts/*` is
         gitignored.)
      3. `firebase deploy --only firestore:indexes` — enables both TTL policies.
      4. `firebase deploy --only firestore:rules` — admin read-only on `chatArchive`.
      5. Ship the client (OTA is fine for this part — no native change).
- [ ] **Confirm both TTL policies show "Serving"** in the console (Firestore → Time-to-live)
      after step 3; creation takes minutes to hours.
