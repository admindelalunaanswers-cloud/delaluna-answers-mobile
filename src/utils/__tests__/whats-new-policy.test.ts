import { WHATS_NEW, type WhatsNewItem } from '@/src/constants/whats-new';
import { decideWhatsNew, itemsForAudience, parseSeenId } from '@/src/utils/whats-new-policy';

const RELEASED = Date.parse('2026-11-15T00:00:00Z');
const BEFORE = RELEASED - 86_400_000;
const AFTER = RELEASED + 86_400_000;

const decide = (over: Partial<Parameters<typeof decideWhatsNew>[0]>) =>
  decideWhatsNew({
    seenId: null,
    currentId: '3.0.0',
    accountCreatedAt: BEFORE,
    releasedAt: RELEASED,
    itemCount: 3,
    newAccount: false,
    ...over,
  });

describe('decideWhatsNew', () => {
  it('skips a release already seen on this device', () => {
    expect(decide({ seenId: '3.0.0' })).toBe('skip');
  });

  it('shows after an upgrade from an earlier release', () => {
    expect(decide({ seenId: '2.9.0' })).toBe('show');
    // Even for an account created after the release: the saved id proves an upgrade.
    expect(decide({ seenId: '2.9.0', accountCreatedAt: AFTER })).toBe('show');
  });

  // New accounts get the tour instead, whatever this device saved before.
  it('stands aside for a new account, even after an upgrade', () => {
    expect(decide({ newAccount: true })).toBe('stamp-silently');
    expect(decide({ newAccount: true, seenId: '2.9.0' })).toBe('stamp-silently');
    // Already seen still wins: nothing to stamp.
    expect(decide({ newAccount: true, seenId: '3.0.0' })).toBe('skip');
  });

  // The first build with this feature: every existing user has nothing saved.
  it('shows to an existing account with nothing saved', () => {
    expect(decide({ seenId: null, accountCreatedAt: BEFORE })).toBe('show');
  });

  it('stamps silently for an account created on or after the release', () => {
    expect(decide({ accountCreatedAt: AFTER })).toBe('stamp-silently');
    expect(decide({ accountCreatedAt: RELEASED })).toBe('stamp-silently');
  });

  // A just-created user doc reports a pending serverTimestamp() as null.
  it('treats an unknown account age as new', () => {
    expect(decide({ accountCreatedAt: null })).toBe('stamp-silently');
  });

  it('never opens an empty sheet, and leaves the id unsaved', () => {
    expect(decide({ itemCount: 0 })).toBe('skip');
    expect(decide({ itemCount: 0, seenId: '2.9.0' })).toBe('skip');
  });
});

describe('parseSeenId', () => {
  it('accepts only a non-empty string', () => {
    expect(parseSeenId('3.0.0')).toBe('3.0.0');
    expect(parseSeenId('')).toBeNull();
    expect(parseSeenId(null)).toBeNull();
    expect(parseSeenId(42)).toBeNull();
  });
});

describe('itemsForAudience', () => {
  const items: WhatsNewItem[] = [
    { id: 'a', icon: 'star', audience: 'all', title: 'A', body: 'a' },
    { id: 'f', icon: 'star', audience: 'free', title: 'F', body: 'f' },
    { id: 'p', icon: 'star', audience: 'premium', title: 'P', body: 'p' },
  ];

  it('gives free users the free and shared items', () => {
    expect(itemsForAudience(items, false).map((i) => i.id)).toEqual(['a', 'f']);
  });

  it('gives premium users the premium and shared items', () => {
    expect(itemsForAudience(items, true).map((i) => i.id)).toEqual(['a', 'p']);
  });
});

// Guards the file that gets edited every release.
describe('WHATS_NEW content', () => {
  it('has an id and a real release date', () => {
    expect(WHATS_NEW.id).toMatch(/\S/);
    expect(Number.isFinite(WHATS_NEW.releasedAt)).toBe(true);
  });

  it('has something for both free and premium users', () => {
    expect(itemsForAudience(WHATS_NEW.items, false).length).toBeGreaterThan(0);
    expect(itemsForAudience(WHATS_NEW.items, true).length).toBeGreaterThan(0);
  });

  it('keeps each plan to four items or fewer', () => {
    expect(itemsForAudience(WHATS_NEW.items, false).length).toBeLessThanOrEqual(4);
    expect(itemsForAudience(WHATS_NEW.items, true).length).toBeLessThanOrEqual(4);
  });

  it('uses unique snake_case item ids (they are analytics values)', () => {
    const ids = WHATS_NEW.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z][a-z0-9_]*$/));
  });

  it('links only to absolute in-app routes', () => {
    WHATS_NEW.items.forEach((i) => {
      if (i.cta) expect(String(i.cta.route)).toMatch(/^\//);
    });
  });
});

describe('versionLabelFor', () => {
  const { versionLabelFor } = require('@/src/constants/whats-new');

  it('names the release by major.minor', () => {
    expect(versionLabelFor('3.0.0')).toBe('Version 3.0');
    expect(versionLabelFor('3.0.1')).toBe('Version 3.0');
    expect(versionLabelFor('4.12.3')).toBe('Version 4.12');
  });

  it('tolerates a short version string', () => {
    expect(versionLabelFor('5')).toBe('Version 5.0');
  });
});

describe('releaseDate', () => {
  const { releaseDate } = require('@/src/constants/whats-new');

  it('is the start of that day on the device clock', () => {
    expect(releaseDate('2026-11-11')).toBe(new Date(2026, 10, 11).getTime());
  });

  it('refuses anything but YYYY-MM-DD', () => {
    expect(() => releaseDate('2026-11-11T10:00')).toThrow();
    expect(() => releaseDate('11/11/2026')).toThrow();
  });
});
