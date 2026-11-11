import {
  cardTop,
  decideTour,
  overlayPath,
  parseTourSeen,
  spotlightHole,
  TOUR_NEW_ACCOUNT_WINDOW_MS,
} from '@/src/utils/tour-policy';

const RELEASED = Date.UTC(2026, 10, 8);
const NOW = RELEASED + 2 * 24 * 60 * 60 * 1000;

describe('decideTour', () => {
  const base = { seenId: null, accountCreatedAt: NOW - 60_000, releasedAt: RELEASED, now: NOW };

  it('offers it to an account created since the release', () => {
    expect(decideTour(base)).toBe('offer');
  });

  it('never offers it twice on one device, whichever version was seen', () => {
    expect(decideTour({ ...base, seenId: 'constellation_v1' })).toBe('skip');
    expect(decideTour({ ...base, seenId: 'some_older_tour' })).toBe('skip');
  });

  // The first build with the tour reaches every existing user with nothing
  // saved. They are stamped, not walked through an app they already use.
  it('stamps an account that predates the release', () => {
    expect(decideTour({ ...base, accountCreatedAt: RELEASED - 1 })).toBe('stamp-silently');
  });

  it('stamps a recent-but-not-new account on a fresh install (a new phone)', () => {
    expect(
      decideTour({ ...base, accountCreatedAt: NOW - TOUR_NEW_ACCOUNT_WINDOW_MS - 1 }),
    ).toBe('stamp-silently');
  });

  // A just-written user doc reads its pending serverTimestamp() as null — that
  // is precisely the person signing up.
  it('treats an unknown account age as new', () => {
    expect(decideTour({ ...base, accountCreatedAt: null })).toBe('offer');
  });
});

describe('parseTourSeen', () => {
  it('accepts only a non-empty string', () => {
    expect(parseTourSeen('constellation_v1')).toBe('constellation_v1');
    expect(parseTourSeen('')).toBeNull();
    expect(parseTourSeen(null)).toBeNull();
    expect(parseTourSeen(undefined)).toBeNull();
    expect(parseTourSeen(42)).toBeNull();
  });
});

describe('spotlightHole', () => {
  const bounds = { width: 390, height: 844 };

  it('pads the target and moves it into the overlay\'s coordinates', () => {
    const hole = spotlightHole({ x: 20, y: 130, width: 100, height: 40 }, { x: 0, y: 10 }, 'rounded', bounds, 8);
    expect(hole).toEqual({ x: 12, y: 112, width: 116, height: 56, radius: 20 });
  });

  it('squares a circle up around the target\'s centre', () => {
    const hole = spotlightHole({ x: 100, y: 780, width: 28, height: 20 }, { x: 0, y: 0 }, 'circle', bounds, 6);
    expect(hole.width).toBe(40);
    expect(hole.height).toBe(40);
    expect(hole.x + hole.width / 2).toBe(114);
    expect(hole.y + hole.height / 2).toBe(790);
    expect(hole.radius).toBe(20);
  });

  it('never runs off the overlay', () => {
    const hole = spotlightHole({ x: 370, y: 830, width: 40, height: 40 }, { x: 0, y: 0 }, 'rounded', bounds, 8);
    expect(hole.x + hole.width).toBe(390);
    expect(hole.y + hole.height).toBe(844);
  });
});

describe('cardTop', () => {
  const common = { screenHeight: 844, insetTop: 50, insetBottom: 34, gap: 16 };

  it('goes below the hole when it fits', () => {
    expect(cardTop({ ...common, hole: { x: 0, y: 110, width: 390, height: 120 }, cardHeight: 300 })).toBe(246);
  });

  it('goes above a hole near the bottom (the tab bar)', () => {
    expect(cardTop({ ...common, hole: { x: 100, y: 760, width: 60, height: 60 }, cardHeight: 300 })).toBe(444);
  });

  it('pins to the bottom when neither side fits, rather than clipping', () => {
    expect(cardTop({ ...common, hole: { x: 0, y: 300, width: 390, height: 200 }, cardHeight: 500 })).toBe(310);
  });

  it('centres when there is no hole', () => {
    expect(cardTop({ ...common, hole: null, cardHeight: 300 })).toBe(272);
  });
});

describe('overlayPath', () => {
  it('is the bare rectangle without a hole', () => {
    expect(overlayPath(390, 844, null)).toBe('M0 0H390V844H0Z');
  });

  it('adds the cut-out as a second subpath', () => {
    const d = overlayPath(390, 844, { x: 10, y: 20, width: 100, height: 50, radius: 10 });
    expect(d.startsWith('M0 0H390V844H0ZM20 20')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });
});
