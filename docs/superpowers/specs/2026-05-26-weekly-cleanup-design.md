# Weekly Cleanup — Design Spec
_Date: 2026-05-26_

## Overview

Replace the existing `weeklyCleanup` Cloud Function body with a unified, date-ID-based cleanup that removes stale `cards`, `horoscope`, and `transits` documents for every user. Runs every Sunday at 06:00 UTC.

---

## Problem

- The existing `weeklyCleanup` attempts to clean horoscopes and transits via collectionGroup queries using field names (`createDate`, `createTime`) that do not match what the client code actually writes — these queries return nothing and are effectively dead.
- Card documents (`users/{uid}/cards/{YYYY-MM-DD}`) have **no cleanup at all** and accumulate indefinitely.

---

## Data Model

All three target subcollections use a `YYYY-MM-DD` string as their document ID:

| Collection | Path | Doc ID | Notes |
|---|---|---|---|
| `cards` | `users/{uid}/cards/{YYYY-MM-DD}` | Date string | Pre-generated for yesterday / today / tomorrow |
| `horoscope` | `users/{uid}/horoscope/{YYYY-MM-DD}` | Date string | Pre-generated for today ± 1 day |
| `transits` | `users/{uid}/transits/{YYYY-MM-DD}` | Date string (Sunday) | One doc per week, keyed to Sunday |

YYYY-MM-DD strings sort lexicographically in the same order as calendar dates, so string comparison is a valid substitute for date arithmetic.

---

## Cleanup Logic

### Schedule
Every Sunday at `06:00 UTC` — before the morning push-notification window opens (06:00–10:00 local).

### Cutoff
```
cutoffDateId = (cleanup date) − 7 days, formatted as YYYY-MM-DD
```
Example: cleanup runs on `2026-05-26` → `cutoffDateId = "2026-05-19"`

Any document whose ID is **less than** `cutoffDateId` is eligible for deletion.

### Algorithm
```
1. Compute cutoffDateId (string)
2. Fetch all user document refs: db.collection('users').listDocuments()
3. For each user (parallelised across users):
     a. cards     = userRef.collection('cards').listDocuments()
     b. horoscope = userRef.collection('horoscope').listDocuments()
     c. transits  = userRef.collection('transits').listDocuments()
     d. Filter each list: keep ref only if ref.id < cutoffDateId
4. Collect all to-delete refs from all users and all three collections
5. Batch-delete in chunks of 500 (Firestore write-batch limit)
6. Log: "[weeklyCleanup] deleted X cards, Y horoscopes, Z transits"
```

### Future-date safety
Pre-generated documents for tomorrow or next week have doc IDs **after** the cutoff and are never touched.

Example on cleanup day `2026-05-26`, cutoff `2026-05-19`:
- `cards/2026-05-27` (tomorrow's pre-gen) → `"2026-05-27" >= "2026-05-19"` ✅ kept
- `horoscope/2026-05-27` → kept ✅
- `transits/2026-05-26` (this week's Sunday) → `"2026-05-26" >= "2026-05-19"` ✅ kept
- `cards/2026-05-18` → `"2026-05-18" < "2026-05-19"` ❌ deleted

---

## Implementation

**File:** `functions/src/index.ts`

**Change:** Replace the existing `weeklyCleanup` export body entirely. The schedule expression and export name stay the same.

**Key implementation notes:**
- Use `userRef.collection(name).listDocuments()` — returns `DocumentReference[]` with no data reads, only path/ID metadata. Much cheaper than `get()`.
- Parallelise per-user work with `Promise.all` to avoid O(users) sequential latency.
- Reuse the existing `BATCH_SIZE = 500` pattern already established in `clearDailyChatHistory`.
- No new dependencies — all Admin SDK methods already imported.

---

## What Is NOT Cleaned Up

| Collection | Reason |
|---|---|
| `connections/{id}` | Permanent user data, never stale |
| `connections/{id}/report/details` | Single doc, overwrites itself on regeneration |
| `connections/{id}/synastryReading/` | Birth-chart-based, never stale |
| `natalChart/details` | Permanent user data |
| `updayedChat/` | Handled by separate `clearDailyChatHistory` (24h rolling) |

---

## Testing Considerations

- Unit test: the cutoff date string calculation for a known Sunday date.
- Manual verification: seed a test user with card docs spanning 10 days, run the function in the Firebase emulator, confirm only docs before the 7-day window are deleted.
- Edge case: user with zero subcollection docs — `listDocuments()` returns `[]`, filter returns `[]`, no batch write issued.
- Edge case: single transit doc for the current week (Sunday ID = cleanup date) → ID equals cleanup date, not less than cutoff → preserved.
