import { resolveChatAllowance } from '@/src/utils/chat-allowance';

/**
 * Regression cover for the chat counter. The bug: purchased questions were
 * held in component state, so they were worth nothing after a remount, and
 * usage was counted from chat documents the user can delete.
 */
describe('resolveChatAllowance', () => {
  const ledger = (usedToday: number, creditsConsumed = 0) => ({
    usedToday,
    creditsConsumed,
  });

  describe('daily allowance', () => {
    it('counts down the daily allowance', () => {
      const a = resolveChatAllowance({
        dailyLimit: 2,
        usage: ledger(1),
        purchasedCredits: 0,
        fallbackUsedToday: 0,
      });

      expect(a.questionsRemaining).toBe(1);
      expect(a.questionLimit).toBe(2);
      expect(a.chatLocked).toBe(false);
    });

    it('locks once the daily allowance is spent and nothing is purchased', () => {
      const a = resolveChatAllowance({
        dailyLimit: 2,
        usage: ledger(2),
        purchasedCredits: 0,
        fallbackUsedToday: 0,
      });

      expect(a.questionsRemaining).toBe(0);
      expect(a.chatLocked).toBe(true);
    });

    it('never reports negative remaining when the server counted more than the limit', () => {
      // The admin screen's limits are display-only and can sit below the
      // server's, so used can legitimately exceed dailyLimit.
      const a = resolveChatAllowance({
        dailyLimit: 2,
        usage: ledger(5),
        purchasedCredits: 0,
        fallbackUsedToday: 0,
      });

      expect(a.questionsRemaining).toBe(0);
      expect(a.chatLocked).toBe(true);
    });
  });

  describe('purchased questions', () => {
    it('unlocks the chat when the daily allowance is gone but credits remain', () => {
      const a = resolveChatAllowance({
        dailyLimit: 2,
        usage: ledger(2),
        purchasedCredits: 3,
        fallbackUsedToday: 0,
      });

      expect(a.creditsLeft).toBe(3);
      expect(a.questionsRemaining).toBe(3);
      expect(a.questionLimit).toBe(5);
      expect(a.chatLocked).toBe(false);
    });

    it('survives a remount: credits come from the ledger, not from local state', () => {
      // The old counter added the pack quantity to component state. A fresh
      // mount reset that to 0 and the chat re-locked. Both of these inputs are
      // server state, so a "remount" is just the same call again.
      const input = {
        dailyLimit: 2,
        usage: ledger(2),
        purchasedCredits: 5,
        fallbackUsedToday: 0,
      };

      expect(resolveChatAllowance(input)).toEqual(
        resolveChatAllowance({ ...input }),
      );
      expect(resolveChatAllowance(input).chatLocked).toBe(false);
      expect(resolveChatAllowance(input).creditsLeft).toBe(5);
    });

    it('subtracts credits already spent, all time', () => {
      const a = resolveChatAllowance({
        dailyLimit: 2,
        usage: ledger(2, 4),
        purchasedCredits: 5,
        fallbackUsedToday: 0,
      });

      expect(a.creditsLeft).toBe(1);
      expect(a.questionsRemaining).toBe(1);
      expect(a.chatLocked).toBe(false);
    });

    it('locks again once every purchased question is spent', () => {
      const a = resolveChatAllowance({
        dailyLimit: 2,
        usage: ledger(2, 5),
        purchasedCredits: 5,
        fallbackUsedToday: 0,
      });

      expect(a.creditsLeft).toBe(0);
      expect(a.chatLocked).toBe(true);
    });

    it('does not let over-spent credits eat into the daily allowance', () => {
      const a = resolveChatAllowance({
        dailyLimit: 2,
        usage: ledger(0, 9),
        purchasedCredits: 5,
        fallbackUsedToday: 0,
      });

      expect(a.creditsLeft).toBe(0);
      expect(a.questionsRemaining).toBe(2);
    });

    it('keeps unspent credits visible while the daily allowance is untouched', () => {
      // Next morning: the allowance resets, the credits are still there.
      const a = resolveChatAllowance({
        dailyLimit: 2,
        usage: ledger(0, 1),
        purchasedCredits: 3,
        fallbackUsedToday: 0,
      });

      expect(a.questionsRemaining).toBe(4);
      expect(a.questionLimit).toBe(4);
    });

    it('supports a purchased-only plan (daily limit 0)', () => {
      const a = resolveChatAllowance({
        dailyLimit: 0,
        usage: ledger(7, 1),
        purchasedCredits: 3,
        fallbackUsedToday: 0,
      });

      expect(a.questionLimit).toBe(2);
      expect(a.questionsRemaining).toBe(2);
      expect(a.chatLocked).toBe(false);
    });
  });

  describe('before the ledger loads', () => {
    it('falls back to the message-derived count rather than a full allowance', () => {
      const a = resolveChatAllowance({
        dailyLimit: 2,
        usage: null,
        purchasedCredits: 0,
        fallbackUsedToday: 2,
      });

      expect(a.questionsUsed).toBe(2);
      expect(a.questionsRemaining).toBe(0);
      expect(a.chatLocked).toBe(true);
    });

    it('prefers the ledger over the message count once it arrives', () => {
      // Cleared chat history: no messages on screen, but the server still
      // counted the sends.
      const a = resolveChatAllowance({
        dailyLimit: 2,
        usage: ledger(2),
        purchasedCredits: 0,
        fallbackUsedToday: 0,
      });

      expect(a.questionsUsed).toBe(2);
      expect(a.chatLocked).toBe(true);
    });

    it('counts purchased credits even before the ledger arrives', () => {
      const a = resolveChatAllowance({
        dailyLimit: 2,
        usage: null,
        purchasedCredits: 3,
        fallbackUsedToday: 2,
      });

      expect(a.creditsLeft).toBe(3);
      expect(a.chatLocked).toBe(false);
    });
  });

  describe('mock grants from the fallback sheet', () => {
    it('adds to the balance without touching the purchased ledger', () => {
      const a = resolveChatAllowance({
        dailyLimit: 2,
        usage: ledger(2, 1),
        purchasedCredits: 1,
        fallbackUsedToday: 0,
        mockExtraQuestions: 3,
      });

      expect(a.creditsLeft).toBe(3);
      expect(a.chatLocked).toBe(false);
    });
  });
});
