/**
 * connection-refresh.ts — the twice-weekly compatibility report cycle.
 *
 * Every connection report is regenerated on the user's local Sunday (the
 * weekday report, framed around Monday–Friday) and local Friday (the weekend
 * report, framed around Friday–Sunday). Same rule for free and premium
 * accounts: every connection the user can read is refreshed (premium 10, free
 * 1, oldest first), and locked ones are not. The only tier differences anywhere
 * in connections are that count and synastry, which stays premium.
 *
 * A report always belongs to a period. `createConnection` stamps the current
 * one, so a connection created on a Tuesday is framed around that week, and the
 * scheduled refresh skips any report already written for the period it would
 * write. That key is also what makes the refresh safe to run twice.
 *
 * Everything here is pure; the Firestore work lives in index.ts.
 */

export type ReportPeriodKind = "week" | "weekend";

export interface ReportPeriod {
  kind: ReportPeriodKind;
  /** Local date the period opens on, YYYY-MM-DD: the Sunday, or the Friday. */
  startDate: string;
  /** `${kind}:${startDate}` — one generation per connection per period. */
  key: string;
}

/** Local hour the refresh runs, ahead of the 8–10 AM reminder push. */
export const REPORT_REFRESH_LOCAL_HOUR = 5;

const SUNDAY = 0;
const FRIDAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

// The offsets billingOffsetMinutes() accepts. Real zones are whole quarter-hours.
const MIN_OFFSET = -720;
const MAX_OFFSET = 840;
const OFFSET_STEP = 15;

/** A Date whose UTC fields read as the user's local wall clock. */
function localClock(now: Date, offsetMinutes: number): Date {
  return new Date(now.getTime() + offsetMinutes * 60 * 1000);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The period a report generated right now belongs to. Sunday–Thursday is the
 * week that opened on the most recent Sunday; Friday–Saturday is the weekend
 * that opened on the most recent Friday.
 *
 * A missing or out-of-range offset is read as UTC, the same fallback billing
 * uses.
 */
export function currentReportPeriod(
  now: Date,
  offsetMinutes: unknown,
): ReportPeriod {
  const offset = validOffset(offsetMinutes) ?? 0;
  const local = localClock(now, offset);
  const day = local.getUTCDay();
  const kind: ReportPeriodKind = day >= FRIDAY ? "weekend" : "week";
  const back = kind === "weekend" ? day - FRIDAY : day - SUNDAY;
  const startDate = isoDate(new Date(local.getTime() - back * DAY_MS));
  return { kind, startDate, key: `${kind}:${startDate}` };
}

export function validOffset(offsetMinutes: unknown): number | null {
  if (
    typeof offsetMinutes !== "number" ||
    !Number.isInteger(offsetMinutes) ||
    offsetMinutes < MIN_OFFSET ||
    offsetMinutes > MAX_OFFSET
  ) {
    return null;
  }
  return offsetMinutes;
}

/**
 * The `timezoneOffsetMinutes` values for which it is currently the refresh hour
 * on a local Sunday or Friday — so the hourly job queries only those users
 * rather than reading the whole user base every hour. Empty on most hours.
 * At most a handful of values, well under Firestore's 30-value `in` limit.
 */
export function offsetsDueForRefresh(now: Date): number[] {
  const due: number[] = [];
  for (let o = MIN_OFFSET; o <= MAX_OFFSET; o += OFFSET_STEP) {
    const local = localClock(now, o);
    const day = local.getUTCDay();
    if (
      (day === SUNDAY || day === FRIDAY) &&
      local.getUTCHours() === REPORT_REFRESH_LOCAL_HOUR
    ) {
      due.push(o);
    }
  }
  return due;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

function spoken(d: Date): string {
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Reads a stored period back, tolerating documents written before it existed. */
export function parseReportPeriod(value: unknown): ReportPeriod | null {
  if (!value || typeof value !== "object") return null;
  const { kind, startDate } = value as { kind?: unknown; startDate?: unknown };
  if (kind !== "week" && kind !== "weekend") return null;
  if (typeof startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return null;
  }
  return { kind, startDate, key: `${kind}:${startDate}` };
}

/**
 * Appends the period framing to a compatibility prompt at generation time.
 * Sent to the model only, never stored: the stored prompt is half of the
 * request hash (see runAnchoredGeneration). A report with no period — one
 * created before this existed — goes out unchanged.
 */
export function withReportPeriod(
  prompt: string,
  period: ReportPeriod | null,
): string {
  if (!period) return prompt;
  const start = new Date(`${period.startDate}T00:00:00Z`);
  const block =
    period.kind === "week"
      ? weekBlock(
          new Date(start.getTime() + 1 * DAY_MS),
          new Date(start.getTime() + 5 * DAY_MS),
        )
      : weekendBlock(start, new Date(start.getTime() + 2 * DAY_MS));
  return `${prompt}\n\n${block}`;
}

function weekBlock(monday: Date, friday: Date): string {
  return `====================================================
REPORTING PERIOD — WEEKDAY REPORT
====================================================
This is the weekday report for ${spoken(monday)} through ${spoken(friday)}.
- Frame "advice" around this coming work week: routines, texting and
  check-ins between busy days, stress spilling over, who reaches out first,
  making time midweek.
- Make it feel current to this week. Do not repeat last week's angle.
- Scores still come from the two charts; the period changes the framing and
  the advice, not the foundation.`;
}

function weekendBlock(friday: Date, sunday: Date): string {
  return `====================================================
REPORTING PERIOD — WEEKEND REPORT
====================================================
This is the weekend romance report for ${spoken(friday)} through ${spoken(sunday)}.
- Frame "advice" around this weekend: plans, dates, nights out, downtime
  together, chemistry, and the Sunday-night comedown.
- Make it feel current to this weekend. Do not repeat the weekday report.
- Scores still come from the two charts; the period changes the framing and
  the advice, not the foundation.`;
}
