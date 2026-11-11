/**
 * When the first-run tour is offered, and where its pieces go on screen.
 * Pure, so every case is unit-tested; storage and React live in
 * src/context/tour-context.tsx, drawing in src/components/tour/.
 */

/** Device-local, like the What's new and accessibility prefs. */
export const TOUR_SEEN_KEY = 'tour:seen:v1';

/**
 * An account older than this is not offered the tour on a fresh install: it is
 * an existing user on a new phone, not someone new to the app.
 */
export const TOUR_NEW_ACCOUNT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * - `offer`: show the welcome card on Home.
 * - `stamp-silently`: record it as seen without showing (an existing user).
 * - `skip`: do nothing (already seen on this device).
 */
export type TourDecision = 'offer' | 'stamp-silently' | 'skip';

export function decideTour(args: {
  /** What storage holds — null when nothing was ever saved. */
  seenId: string | null;
  /** The account's `createdAt` in epoch ms, or null if unknown. */
  accountCreatedAt: number | null;
  releasedAt: number;
  now: number;
}): TourDecision {
  const { seenId, accountCreatedAt, releasedAt, now } = args;

  // Any version seen on this device counts. A later tour is a "What's new"
  // item, not a second forced walkthrough.
  if (seenId !== null) return 'skip';

  // A just-created user doc reports its pending `serverTimestamp()` as null,
  // and that is exactly the person the tour is for. This is also why it can't
  // collide with the What's new sheet, which treats unknown age as "stamp".
  if (accountCreatedAt === null) return 'offer';

  if (accountCreatedAt < releasedAt) return 'stamp-silently';
  if (now - accountCreatedAt > TOUR_NEW_ACCOUNT_WINDOW_MS) return 'stamp-silently';
  return 'offer';
}

/** Storage can hand back anything; only a non-empty string is an id. */
export function parseTourSeen(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

// ─── Layout ───────────────────────────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Hole extends Rect {
  radius: number;
}

/**
 * The spotlight around a measured target. `target` and `origin` are both
 * window coordinates (`measureInWindow`), so subtracting the overlay's own
 * origin keeps it right under an edge-to-edge or translucent status bar.
 * Circles are squared up around the centre; everything is clamped to the
 * overlay so the cut-out never runs off the edge.
 */
export function spotlightHole(
  target: Rect,
  origin: { x: number; y: number },
  shape: 'rounded' | 'circle',
  bounds: { width: number; height: number },
  padding = 8,
): Hole {
  let x = target.x - origin.x - padding;
  let y = target.y - origin.y - padding;
  let width = target.width + padding * 2;
  let height = target.height + padding * 2;

  if (shape === 'circle') {
    const size = Math.max(width, height);
    x -= (size - width) / 2;
    y -= (size - height) / 2;
    width = size;
    height = size;
  }

  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(bounds.width, x + width);
  const bottom = Math.min(bounds.height, y + height);
  const w = Math.max(0, right - left);
  const h = Math.max(0, bottom - top);

  return {
    x: left,
    y: top,
    width: w,
    height: h,
    radius: shape === 'circle' ? Math.min(w, h) / 2 : Math.min(20, h / 2),
  };
}

/**
 * Top of the step card: below the hole if it fits, else above, else pinned to
 * the bottom edge over the hole (a tall card at the largest text size can fit
 * neither side, and covering the target beats clipping the buttons).
 */
export function cardTop(args: {
  hole: Rect | null;
  cardHeight: number;
  screenHeight: number;
  insetTop: number;
  insetBottom: number;
  gap: number;
}): number {
  const { hole, cardHeight, screenHeight, insetTop, insetBottom, gap } = args;
  const floor = screenHeight - insetBottom;

  if (!hole) return Math.max(insetTop, (screenHeight - cardHeight) / 2);

  const below = hole.y + hole.height + gap;
  if (below + cardHeight <= floor) return below;

  const above = hole.y - gap - cardHeight;
  if (above >= insetTop) return above;

  return Math.max(insetTop, floor - cardHeight);
}

/**
 * An SVG path covering the whole overlay with the hole cut out — drawn with
 * `fillRule="evenodd"`, so the rounded rect inside the outer one is left empty.
 */
export function overlayPath(width: number, height: number, hole: Hole | null): string {
  const outer = `M0 0H${width}V${height}H0Z`;
  if (!hole || hole.width === 0 || hole.height === 0) return outer;
  const { x, y, width: w, height: h } = hole;
  const r = Math.min(hole.radius, w / 2, h / 2);
  return (
    `${outer}M${x + r} ${y}` +
    `H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}` +
    `V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}
