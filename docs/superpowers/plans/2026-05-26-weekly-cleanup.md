# Weekly Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken `weeklyCleanup` Cloud Function body with a unified date-ID-based sweep that removes stale `cards`, `horoscope`, and `transits` documents for every user on Sundays.

**Architecture:** For every user doc in `users/`, list document references (not their data) in all three subcollections. Filter any ref whose ID (a YYYY-MM-DD string) is lexicographically less than the cutoff date (today − 7 days). Batch-delete matches in chunks of 500. No timestamp fields or collectionGroup index queries needed.

**Tech Stack:** Firebase Admin SDK (Firestore), Firebase Functions v2 scheduler, TypeScript.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `functions/src/index.ts` | **Modify** lines 1071–1123 | Replace JSDoc comment + entire `weeklyCleanup` body |

No new files. No new dependencies.

---

### Task 1: Replace the `weeklyCleanup` function

**Files:**
- Modify: `functions/src/index.ts:1071-1123`

The existing implementation uses field names (`createTime`, `createDate`) that do not exist on the documents our code writes — those collectionGroup queries return zero results. Replace the entire block (comment + export) with the doc-ID approach.

- [ ] **Step 1: Open `functions/src/index.ts` and locate the cleanup block**

Find the section starting at line 1071:
```
// ─── weeklyCleanup ───────────────────────────────────────────────────────────
```
It ends at the closing `});` on line 1123. You will replace **everything from line 1071 to line 1123 inclusive**.

- [ ] **Step 2: Replace the entire block with the new implementation**

Delete lines 1071–1123 and insert the following in their place:

```typescript
// ─── weeklyCleanup ───────────────────────────────────────────────────────────

/**
 * Runs every Sunday at 06:00 UTC (before any user's local Sunday-morning
 * push window opens). Prunes documents older than 7 days from:
 *   - users/{uid}/cards/{YYYY-MM-DD}
 *   - users/{uid}/horoscope/{YYYY-MM-DD}
 *   - users/{uid}/transits/{YYYY-MM-DD}
 *
 * All three subcollections use a YYYY-MM-DD document ID. YYYY-MM-DD strings
 * sort lexicographically in the same order as calendar dates, so a simple
 * string comparison against the cutoff date is sufficient — no timestamp
 * fields or collectionGroup index queries needed.
 *
 * Synastry readings, connection reports, and natal chart docs are NOT touched
 * — they are birth-chart-based and never stale.
 */
export const weeklyCleanup = onSchedule('every sunday 06:00', async () => {
  // Cutoff: 7 days before today, formatted as YYYY-MM-DD.
  // Any doc whose ID is strictly less than this string is eligible for deletion.
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  const cutoffDateId = [
    cutoff.getUTCFullYear(),
    String(cutoff.getUTCMonth() + 1).padStart(2, '0'),
    String(cutoff.getUTCDate()).padStart(2, '0'),
  ].join('-');

  console.info(`[weeklyCleanup] cutoff date: ${cutoffDateId}`);

  // List all user document references (no data reads — paths only).
  const userRefs = await db.collection('users').listDocuments();

  let cardsDeleted = 0;
  let horoscopesDeleted = 0;
  let transitsDeleted = 0;

  const allToDelete: FirebaseFirestore.DocumentReference[] = [];

  // For each user, list all three subcollections in parallel and collect stale refs.
  await Promise.all(userRefs.map(async (userRef) => {
    const [cardRefs, horoRefs, transitRefs] = await Promise.all([
      userRef.collection('cards').listDocuments(),
      userRef.collection('horoscope').listDocuments(),
      userRef.collection('transits').listDocuments(),
    ]);

    const oldCards      = cardRefs.filter(r => r.id < cutoffDateId);
    const oldHoroscopes = horoRefs.filter(r => r.id < cutoffDateId);
    const oldTransits   = transitRefs.filter(r => r.id < cutoffDateId);

    cardsDeleted      += oldCards.length;
    horoscopesDeleted += oldHoroscopes.length;
    transitsDeleted   += oldTransits.length;

    allToDelete.push(...oldCards, ...oldHoroscopes, ...oldTransits);
  }));

  // Batch-delete in chunks of 500 (Firestore write-batch limit).
  const BATCH_SIZE = 500;
  for (let i = 0; i < allToDelete.length; i += BATCH_SIZE) {
    const batch = db.batch();
    allToDelete.slice(i, i + BATCH_SIZE).forEach(ref => batch.delete(ref));
    await batch.commit();
  }

  console.info(
    `[weeklyCleanup] deleted ${cardsDeleted} cards, ` +
    `${horoscopesDeleted} horoscopes, ${transitsDeleted} transits`,
  );
});
```

- [ ] **Step 3: Build to verify TypeScript compiles with no errors**

Run from the `functions/` directory:
```bash
cd functions && npm run build
```
Expected output: compilation succeeds, `lib/index.js` is written, **no errors**.

If you see `error TS2339: Property 'listDocuments' does not exist` — this means the Admin SDK types aren't resolving. Verify that `firebase-admin` version is `^13.x` in `functions/package.json` (it is — version 13.8.0). Run `npm install` in `functions/` if needed.

- [ ] **Step 4: Verify the cutoff date logic by reasoning through a concrete example**

The function runs on Sunday `2026-05-26` at 06:00 UTC:
- `cutoff = new Date()` → `2026-05-26T06:00:00Z`
- `cutoff.setUTCDate(26 - 7)` → `2026-05-19`
- `cutoffDateId = "2026-05-19"`

Check each expected outcome:
| Doc ID | `id < "2026-05-19"` | Expected |
|---|---|---|
| `"2026-05-18"` | ✅ true | deleted |
| `"2026-05-19"` | ❌ false (equal) | kept |
| `"2026-05-26"` | ❌ false | kept |
| `"2026-05-27"` | ❌ false | kept (tomorrow's pre-gen) |

Confirm these match the spec before continuing.

- [ ] **Step 5: Commit**

```bash
git add functions/src/index.ts functions/lib/index.js
git commit -m "feat: rewrite weeklyCleanup to purge cards, horoscopes, and transits older than 7 days

- Replaces broken collectionGroup queries (createTime/createDate fields did not exist)
- Cards subcollection now included for the first time
- All three collections use doc ID (YYYY-MM-DD) string comparison — no timestamp fields needed
- Consistent 7-day window across cards, horoscope, and transits
- listDocuments() fetches refs only (no data reads) before filtering

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Manual Emulator Verification (optional but recommended before deploy)

If you want to smoke-test against real Firestore data before deploying:

```bash
# From project root
firebase emulators:start --only firestore,functions

# In a separate terminal — seed test data for a fake user
# Then trigger the function manually via the emulator UI at:
# http://localhost:4000 → Functions → weeklyCleanup → trigger
```

Seed script to paste into the Firestore emulator UI or a scratch script:
```
users/test-uid/cards/2026-05-10   { date: "2026-05-10" }   ← should be deleted
users/test-uid/cards/2026-05-18   { date: "2026-05-18" }   ← should be deleted
users/test-uid/cards/2026-05-19   { date: "2026-05-19" }   ← should be KEPT
users/test-uid/cards/2026-05-26   { date: "2026-05-26" }   ← should be KEPT
users/test-uid/horoscope/2026-05-17  { requestedAt: ... }  ← deleted
users/test-uid/horoscope/2026-05-26  { requestedAt: ... }  ← kept
users/test-uid/transits/2026-05-12   { requestedAt: ... }  ← deleted
users/test-uid/transits/2026-05-19   { requestedAt: ... }  ← kept
```

After triggering: confirm only the two pre-cutoff docs per collection are gone.

---

## Deploy

```bash
cd functions && firebase deploy --only functions:weeklyCleanup
```
