import {
  chatUsageDayId,
  msUntilNextChatUsageDay,
  subscribeToChatUsage,
} from '@/src/services/chat.service';
import { collection, doc, onSnapshot } from 'firebase/firestore';

jest.mock('@/firebaseConfig', () => ({
  db: {},
  functions: {},
}));

type SnapshotCall = [
  unknown,
  (snap: {
    exists: () => boolean;
    data: () => Record<string, unknown> | undefined;
  }) => void,
  (err: Error) => void,
];

const snapshot = (data?: Record<string, unknown>) => ({
  exists: () => data !== undefined,
  data: () => data,
});

describe('chat usage ledger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * `sendChatMessage` bills against the day it derives from the user's stored
   * `timezoneOffsetMinutes`. If the client names the day any other way it
   * reads a document the server never writes, and the counter shows a full
   * allowance to someone who has none.
   */
  describe('chatUsageDayId', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    const at = (iso: string) => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(iso));
    };

    it('uses the UTC date when the user sits at UTC', () => {
      at('2026-03-01T12:00:00Z');
      expect(chatUsageDayId(0)).toBe('2026-03-01');
    });

    it('reports the previous day for a negative offset before UTC midnight rolls back', () => {
      // 03:00 UTC is still 19:00 the day before in UTC-8.
      at('2026-03-01T03:00:00Z');
      expect(chatUsageDayId(-480)).toBe('2026-02-28');
    });

    it('reports the next day for an offset far enough ahead', () => {
      // 23:00 UTC is already 12:00 the next day in UTC+13.
      at('2026-03-01T23:00:00Z');
      expect(chatUsageDayId(780)).toBe('2026-03-02');
    });

    it('falls back to the UTC date when the offset is missing, as the server does', () => {
      at('2026-03-01T23:00:00Z');
      expect(chatUsageDayId(undefined)).toBe('2026-03-01');
    });

    it('ignores a non-finite offset rather than producing an invalid id', () => {
      at('2026-03-01T23:00:00Z');
      expect(chatUsageDayId(NaN)).toBe('2026-03-01');
      expect(chatUsageDayId(Infinity)).toBe('2026-03-01');
    });

    it('zero-pads month and day', () => {
      at('2026-01-05T12:00:00Z');
      expect(chatUsageDayId(0)).toBe('2026-01-05');
    });

    /**
     * The user writes their own offset, and every distinct day id is a fresh
     * allowance — so an offset outside the real range would name a day the
     * server refuses to bill against. It treats those as UTC, and so must this.
     */
    it('treats an offset outside −12:00…+14:00 as UTC, as the server does', () => {
      at('2026-03-01T12:00:00Z');
      expect(chatUsageDayId(14 * 60 + 1)).toBe('2026-03-01');
      expect(chatUsageDayId(-12 * 60 - 1)).toBe('2026-03-01');
      expect(chatUsageDayId(1_000_000)).toBe('2026-03-01');
    });

    it('keeps the extremes of the real range', () => {
      // 12:00 UTC is 02:00 the next day at +14:00 and 00:00 the same day at −12:00.
      at('2026-03-01T12:00:00Z');
      expect(chatUsageDayId(14 * 60)).toBe('2026-03-02');
      expect(chatUsageDayId(-12 * 60)).toBe('2026-03-01');
    });

    it('treats a fractional offset as UTC rather than a real zone', () => {
      at('2026-03-01T23:00:00Z');
      expect(chatUsageDayId(330.5)).toBe('2026-03-01');
    });
  });

  describe('msUntilNextChatUsageDay', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('measures to the next local midnight, not the next UTC midnight', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-03-01T22:00:00Z'));

      const hours = 60 * 60 * 1000;
      expect(msUntilNextChatUsageDay(0)).toBe(2 * hours);
      // 22:00 UTC is 14:00 in UTC-8, so ten hours of local day are left.
      expect(msUntilNextChatUsageDay(-480)).toBe(10 * hours);
    });

    it('measures to UTC midnight for an out-of-range offset', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-03-01T22:00:00Z'));
      expect(msUntilNextChatUsageDay(1_000_000)).toBe(2 * 60 * 60 * 1000);
    });

    it('is always positive, so a timer scheduled on it fires in the future', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-03-01T23:59:59Z'));
      expect(msUntilNextChatUsageDay(0)).toBeGreaterThan(0);
    });
  });

  describe('subscribeToChatUsage', () => {
    it('watches the named day document and the credit ledger', () => {
      (onSnapshot as jest.Mock).mockReturnValue(jest.fn());

      subscribeToChatUsage('uid-1', '2026-03-01', jest.fn());

      expect(collection).toHaveBeenCalledWith(
        expect.anything(),
        'users',
        'uid-1',
        'chatUsage',
      );
      expect(doc).toHaveBeenCalledWith(expect.anything(), '2026-03-01');
      expect(doc).toHaveBeenCalledWith(expect.anything(), '_credits');
      expect(onSnapshot).toHaveBeenCalledTimes(2);
    });

    it('reports usage and spent credits together', () => {
      (onSnapshot as jest.Mock).mockReturnValue(jest.fn());
      const onUsage = jest.fn();

      subscribeToChatUsage('uid-1', '2026-03-01', onUsage);
      const [dayCall, creditCall] = (onSnapshot as jest.Mock).mock
        .calls as SnapshotCall[];

      dayCall[1](snapshot({ count: 2 }));
      expect(onUsage).toHaveBeenLastCalledWith({
        usedToday: 2,
        creditsConsumed: 0,
        hasLedger: true,
      });

      creditCall[1](snapshot({ consumed: 3 }));
      expect(onUsage).toHaveBeenLastCalledWith({
        usedToday: 2,
        creditsConsumed: 3,
        hasLedger: true,
      });
    });

    it('reports a missing day document as having no ledger at all', () => {
      // Not the same as a ledger reading zero: no document means the server
      // isn't metering this account (an admin send is exempt, and a build
      // predating metering never writes one), and the counter has to fall back
      // to the messages on screen instead of showing a full allowance.
      (onSnapshot as jest.Mock).mockReturnValue(jest.fn());
      const onUsage = jest.fn();

      subscribeToChatUsage('uid-1', '2026-03-01', onUsage);
      const [dayCall] = (onSnapshot as jest.Mock).mock.calls as SnapshotCall[];

      dayCall[1](snapshot(undefined));
      expect(onUsage).toHaveBeenLastCalledWith({
        usedToday: 0,
        creditsConsumed: 0,
        hasLedger: false,
      });
    });

    it('leaves the last known usage in place when a listener fails', () => {
      // A denied read must not read as "no questions used" — that would show a
      // full allowance to someone who has spent theirs.
      (onSnapshot as jest.Mock).mockReturnValue(jest.fn());
      const onUsage = jest.fn();

      subscribeToChatUsage('uid-1', '2026-03-01', onUsage);
      const [dayCall, creditCall] = (onSnapshot as jest.Mock).mock
        .calls as SnapshotCall[];

      dayCall[1](snapshot({ count: 2 }));
      onUsage.mockClear();

      creditCall[2](new Error('permission-denied'));
      expect(onUsage).not.toHaveBeenCalled();
    });

    it('detaches both listeners on unsubscribe', () => {
      const unsubDay = jest.fn();
      const unsubCredits = jest.fn();
      (onSnapshot as jest.Mock)
        .mockReturnValueOnce(unsubDay)
        .mockReturnValueOnce(unsubCredits);

      subscribeToChatUsage('uid-1', '2026-03-01', jest.fn())();

      expect(unsubDay).toHaveBeenCalledTimes(1);
      expect(unsubCredits).toHaveBeenCalledTimes(1);
    });
  });
});
