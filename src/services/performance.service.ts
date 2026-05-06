/**
 * performance.service.ts
 * Thin wrapper around @react-native-firebase/perf using the v22 modular API.
 *
 * Auto-collected (no code needed):
 *   - app_start trace (cold start time)
 *   - screen rendering: slow / frozen frames per screen
 *   - HTTP/HTTPS network request timings (URL, response code, payload sizes)
 *
 * This module exposes helpers for *custom* traces — wrap a code block to
 * measure how long it takes (e.g. natal chart calc, AI breakdown fetch).
 *
 * - All calls are fail-silent; perf failures must never crash the app.
 * - Trace names: <= 100 chars, A-Z / a-z / 0-9 / _ / -.
 * - Attribute keys/values: <= 40 / 100 chars, max 5 attrs per trace.
 * - Metric keys: <= 100 chars, values must be integers.
 */

import { getPerformance, trace } from '@react-native-firebase/perf';

type Attributes = Record<string, string>;

function safe<T>(fn: () => Promise<T>, label: string): Promise<T | void> {
  return fn().catch((err) => {
    if (__DEV__) console.warn(`[perf] ${label} failed:`, err);
  });
}

/**
 * Measure how long an async function takes. The trace records duration
 * automatically; pass attributes/metrics to add custom dimensions.
 *
 *   const result = await measure('natal_chart_calc', () => calculateNatalChart(bd));
 *   const result = await measure('chat_send', () => sendChatMessage(...), {
 *     attributes: { connection: 'true' },
 *   });
 */
export async function measure<T>(
  name: string,
  fn: () => Promise<T>,
  opts?: { attributes?: Attributes; metrics?: Record<string, number> },
): Promise<T> {
  let t: Awaited<ReturnType<typeof trace>> | null = null;
  try {
    t = await trace(getPerformance(), name);
    await t.start();
    if (opts?.attributes) {
      for (const [k, v] of Object.entries(opts.attributes)) {
        t.putAttribute(k, v);
      }
    }
  } catch (err) {
    if (__DEV__) console.warn(`[perf] start ${name} failed:`, err);
    t = null;
  }

  try {
    const result = await fn();
    if (t && opts?.metrics) {
      for (const [k, v] of Object.entries(opts.metrics)) {
        t.putMetric(k, Math.round(v));
      }
    }
    return result;
  } finally {
    if (t) {
      try {
        await t.stop();
      } catch (err) {
        if (__DEV__) console.warn(`[perf] stop ${name} failed:`, err);
      }
    }
  }
}

/**
 * Lower-level handle for traces that span multiple call sites or where the
 * "work" isn't a single async fn (e.g. waiting on a Firestore listener).
 *
 *   const t = await startTrace('chat_response_roundtrip');
 *   t?.putAttribute('has_connection', 'true');
 *   // ...later, when the response arrives
 *   await stopTrace(t);
 */
export async function startTrace(name: string) {
  try {
    const t = await trace(getPerformance(), name);
    await t.start();
    return t;
  } catch (err) {
    if (__DEV__) console.warn(`[perf] startTrace ${name} failed:`, err);
    return null;
  }
}

export async function stopTrace(
  t: Awaited<ReturnType<typeof startTrace>> | null,
  opts?: { attributes?: Attributes; metrics?: Record<string, number> },
): Promise<void> {
  if (!t) return;
  try {
    if (opts?.attributes) {
      for (const [k, v] of Object.entries(opts.attributes)) {
        t.putAttribute(k, v);
      }
    }
    if (opts?.metrics) {
      for (const [k, v] of Object.entries(opts.metrics)) {
        t.putMetric(k, Math.round(v));
      }
    }
    await t.stop();
  } catch (err) {
    if (__DEV__) console.warn('[perf] stopTrace failed:', err);
  }
}

/**
 * Toggle perf collection at runtime (e.g. for a privacy opt-out).
 * Persists across sessions.
 */
export function setPerformanceEnabled(enabled: boolean): Promise<void | void> {
  return safe(async () => {
    const perf = getPerformance();
    perf.setPerformanceCollectionEnabled(enabled);
  }, 'setPerformanceEnabled');
}
