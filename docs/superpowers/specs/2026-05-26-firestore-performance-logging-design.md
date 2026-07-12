# Firestore Performance Logging — Design Spec

**Date:** 2026-05-26
**Status:** Approved
**Project:** Delaluna Answers Mobile

---

## Overview

Add a custom Firestore-backed performance logging system that captures screen load times,
AI/API call durations, error counts, and user context — organized by screen. Raw events
are written by the mobile client; a scheduled Cloud Function aggregates them into daily
per-screen summaries and prunes old data.

This system complements (does not replace) the existing layers:
- `performance.service.ts` — Firebase Performance Monitoring SDK traces (Firebase Console)
- `analytics.service.ts` — GA4 analytics events (Google Analytics)

The Firestore layer adds **queryable, admin-visible** metrics that your own code can read
and display in an admin dashboard.

---

## Goals

- Capture per-screen performance data: load time, AI/API call duration, errors
- Organize Firestore data by screen for easy admin querying
- Aggregate raw events into daily summaries (p50/p95) via Cloud Function
- Auto-clean raw events after 7 days; keep daily summaries for 90 days
- Zero impact on app startup — all writes are fire-and-forget
- Support segmentation by: `isPro`, `appVersion`, `environment`, `os`

---

## Non-Goals

- Replacing Firebase Performance Monitoring SDK (`performance.service.ts` stays)
- Real-time streaming dashboards (daily summaries are sufficient)
- Per-session replay or network-level tracing
- Admin panel UI (separate feature, out of scope)

---

## Firestore Schema

### Root: `performanceLogs/{screenSlug}`

One document per screen. The `screenSlug` is derived from the human-readable screen label:
lowercase, spaces replaced with `-` (e.g. `"Chat"` → `"chat"`, `"Birth Chart"` → `"birth-chart"`).

```
performanceLogs/{screenSlug}
  screen: string          // "Chat", "Home", "Birth Chart" …
  screenPath: string      // "/(main)/chat", "/(home)/birth-chart-view" …
  lastEventAt: Timestamp  // updated on every client write (merge)
```

### Subcollection: `events/{autoId}`

Raw events written by the mobile client. Deleted after 7 days by the aggregation CF.

```
performanceLogs/{screenSlug}/events/{autoId}
  screen: string                     // human label, matches parent doc
  screenPath: string                 // Expo Router path
  metricType: "screen_load"
            | "ai_call"
            | "error"
  durationMs: number                 // omitted for "error" type
  operationName?: string             // "horoscope_fetch", "chat_send",
                                     // "natal_chart_calc", "transit_fetch" …
  errorMessage?: string              // for "error" type only
  userId?: string                    // omitted if unauthenticated
  isPro: boolean
  appVersion: string                 // from Constants.expoConfig.version
  environment: string                // "development" | "preview" | "production"
  os: string                         // "ios" | "android"
  sessionId: string                  // random UUID generated once per app launch
  timestamp: Timestamp               // FieldValue.serverTimestamp()
```

### Subcollection: `daily/{YYYY-MM-DD}`

Written exclusively by the Cloud Function (admin SDK). Kept for 90 days.

```
performanceLogs/{screenSlug}/daily/{YYYY-MM-DD}
  screen: string
  date: string                       // "2026-05-26"
  screenLoad: {
    count: number
    sumMs: number
    minMs: number
    maxMs: number
    p50Ms: number
    p95Ms: number
  }
  operations: {
    [operationName: string]: {
      count: number
      sumMs: number
      p50Ms: number
      p95Ms: number
    }
  }
  errorCount: number
  totalEvents: number
  updatedAt: Timestamp
```

---

## Data Retention

| Data            | Retention | Mechanism                                              |
|-----------------|-----------|--------------------------------------------------------|
| Raw `events`    | 7 days    | Deleted by `aggregatePerfLogs` CF during nightly run   |
| `daily` summaries | 90 days | Deleted by `aggregatePerfLogs` CF during nightly run   |
| Screen root docs | Permanent | Metadata only; never deleted                          |

---

## Screen Slugs

Derived from the `ROUTE_LABELS` map already in `analytics.service.ts`. The slug conversion:

```
screenLabelForPath(pathname)   →  "Birth Chart"
  .toLowerCase()               →  "birth chart"
  .replace(/\s+/g, "-")        →  "birth-chart"
  .replace(/[^a-z0-9-]/g, "")  →  "birth-chart"
```

A `screenSlugForPath(pathname)` helper lives in the new `perf-log.service.ts` and imports
`screenLabelForPath` from `analytics.service.ts` to stay in sync with the existing label map.

---

## Client-side: `src/services/perf-log.service.ts`

New service. All three exported functions are fire-and-forget (swallow errors, warn in `__DEV__`).

### Session context

A module-level `SessionContext` object is built once at module load:

```ts
{
  sessionId: string   // crypto.randomUUID() or nanoid fallback
  appVersion: string  // Constants.expoConfig?.version ?? "unknown"
  environment: string // imported from src/constants/env.ts (APP_ENV)
  os: string          // Platform.OS
}
```

User context (`userId`, `isPro`) is passed at call time via `opts` rather than cached in
module scope — avoids stale values after login/logout/upgrade.

### Exported API

```ts
logScreenLoad(
  screenPath: string,
  durationMs: number,
  opts?: { userId?: string; isPro?: boolean }
): void

logOperation(
  screenPath: string,
  operationName: string,
  durationMs: number,
  opts?: { userId?: string; isPro?: boolean }
): void

logError(
  screenPath: string,
  errorMessage: string,
  opts?: { userId?: string; isPro?: boolean }
): void
```

### Firestore write strategy

Each call does two concurrent writes (not a batch — fire-and-forget semantics,
partial failure is acceptable):

1. `setDoc(screenDocRef, { screen, screenPath, lastEventAt: serverTimestamp() }, { merge: true })`
2. `addDoc(eventsCollectionRef, { ...event, timestamp: serverTimestamp() })`

---

## React Hook: `src/hooks/use-screen-perf-log.ts`

```ts
function useScreenPerfLog(screenPath: string): {
  markReady: () => void
  logOp: (operationName: string, durationMs: number) => void
  logError: (message: string) => void
}
```

- `mountTime` captured in a `useRef` on mount
- `markReady()` — calls `logScreenLoad(screenPath, Date.now() - mountTime.current, userCtx)`;
  idempotent (only fires once via a `reported` ref)
- `logOp` / `logError` — thin wrappers over `perf-log.service`
- User context (`userId`, `isPro`) read from `useUser()` and `useRevenueCat()` contexts
  inside the hook

### Usage in screens

```tsx
const { markReady, logOp, logError } = useScreenPerfLog('/(main)/chat');

// When content is visible / data loaded:
useEffect(() => {
  if (!loading) markReady();
}, [loading]);

// Around any timed async op:
const t = Date.now();
try {
  await sendMessage(text);
  logOp('chat_send', Date.now() - t);
} catch (e) {
  logError(e.message);
}
```

---

## Cloud Function: `aggregatePerfLogs`

### Schedule

`every day 02:00` UTC — safely after midnight rollover (00:00 UTC), before the morning
push window (06:00 UTC).

### Algorithm

```
yesterday    = today - 1 day, formatted as YYYY-MM-DD
cutoffRaw    = today - 7 days  (raw event deletion boundary)
cutoffDaily  = today - 90 days (daily summary deletion boundary)

for each screen doc in performanceLogs/:
  1. Query events where timestamp in [start of yesterday, start of today)
  2. Compute screenLoad stats from events where metricType == "screen_load"
  3. Compute per-operationName stats from events where metricType == "ai_call"
  4. Count events where metricType == "error"
  5. Write performanceLogs/{slug}/daily/{yesterday}
  6. Delete raw events where timestamp < cutoffRaw  (batch of 500)
  7. Delete daily docs where doc.id < cutoffDaily   (lex sort on YYYY-MM-DD)
```

### Percentile calculation

No external stats library needed. For a sorted array of durations:

```ts
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
```

### Concurrency & error handling

- Screen docs processed in chunks of 10 (matches `weeklyCleanup` pattern)
- Each screen wrapped in `try/catch` — one bad screen does not abort others
- Delete raw events in Firestore batches of 500 (Firestore write-batch limit)
- Logs total events processed, screens visited, deletion counts

---

## Firestore Security Rules

Added to `firestore.rules`:

```
match /performanceLogs/{screenSlug} {
  // Signed-in client can merge lastEventAt onto the parent doc
  allow write: if request.auth != null;
  allow read:  if request.auth.token.admin == true;

  match /events/{eventId} {
    // Client can only create (not update/delete) their own events
    allow create: if request.auth != null
      && request.resource.data.userId == request.auth.uid;
    allow read:   if request.auth.token.admin == true;
    allow update, delete: if false;
  }

  match /daily/{date} {
    // CF writes via admin SDK (bypasses rules); admin panel reads
    allow read:  if request.auth.token.admin == true;
    allow write: if false;
  }
}
```

---

## Files to Create

| File                                  | Purpose                        |
|---------------------------------------|--------------------------------|
| `src/services/perf-log.service.ts`    | Firestore write helpers        |
| `src/hooks/use-screen-perf-log.ts`    | Screen-level timing hook       |

## Files to Modify

| File                      | Change                                           |
|---------------------------|--------------------------------------------------|
| `functions/src/index.ts`  | Add `aggregatePerfLogs` scheduled CF             |
| `firestore.rules`         | Add `performanceLogs` security rules             |

## Screens to Instrument (priority order)

1. `app/(main)/chat.tsx` — highest impact (AI calls)
2. `app/(main)/index.tsx` — home / birth data input
3. `app/(home)/birth-chart-view.tsx` — chart breakdown
4. `app/(main)/transits.tsx`
5. `app/(auth)/sign-up.tsx` and `app/(auth)/verify-email.tsx`
6. Remaining screens from `ROUTE_LABELS`

---

## Testing

- Unit tests for `perf-log.service.ts`: mock Firestore, assert correct collection paths
  and event shapes for all three `metricType` values
- Unit tests for `use-screen-perf-log.ts`: mock the service, assert `markReady` fires once,
  `logOp` and `logError` pass through correctly
- Unit tests for the `percentile()` helper in the CF
- Manual: run app locally, navigate screens, verify events appear in Firestore Emulator
  under `performanceLogs/{slug}/events`
- Manual: trigger `aggregatePerfLogs` via emulator, verify `daily/{date}` doc is created
  and raw events are deleted

---

## Future Work

- Admin panel UI to display `daily` summaries (separate spec)
- If event volume exceeds ~1 000/day per screen, consider BigQuery export instead of
  raw Firestore events
- `sessionId` is ephemeral (not persisted across launches) — store in SecureStore if
  cross-session funnel analysis is needed later
