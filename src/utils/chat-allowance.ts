/**
 * chat-allowance.ts
 * Turns the server's question ledger into the numbers the chat counter shows.
 *
 * Kept as a pure function, separate from the screen, because this arithmetic
 * is the thing that was wrong: purchased questions used to live in component
 * state, so they vanished on the next mount and the chat re-locked while the
 * server still held the credits. Everything here comes from the server's own
 * ledger (`users/{uid}/chatUsage`) and RevenueCat's purchase record, which is
 * exactly what `sendChatMessage` bills against.
 */

import type { ChatUsage } from '@/src/services/chat.service';

export interface ChatAllowanceInput {
  /** Questions granted per day by the user's plan. */
  dailyLimit: number;
  /** The server ledger, or null before the first snapshot arrives. */
  usage: ChatUsage | null;
  /** Chat-pack questions ever bought, from RevenueCat. */
  purchasedCredits: number;
  /**
   * Message-derived count, used whenever there is no ledger to read: before
   * the first snapshot arrives, and for any account the server isn't metering
   * (an admin, or a build whose `sendChatMessage` predates metering). Showing a
   * full allowance in either case is what made the counter look frozen.
   */
  fallbackUsedToday: number;
  /**
   * The server exempts admins from billing outright, so no ledger is ever
   * written for them and no send is ever refused. Keeps the chat unlocked
   * rather than counting down toward a limit that isn't enforced.
   */
  unmetered?: boolean;
  /**
   * Questions handed out by the fallback sheet when RevenueCat can't sell.
   * No transaction stands behind them, so the server won't honour them; they
   * exist so the placeholder still demoes in a build without RevenueCat.
   */
  mockExtraQuestions?: number;
}

export interface ChatAllowance {
  questionsUsed: number;
  /** True when the server isn't billing this account — see `unmetered`. */
  unmetered: boolean;
  /** Purchased questions still unspent. */
  creditsLeft: number;
  /** Denominator for the "N of M" counter: today's allowance plus credits. */
  questionLimit: number;
  questionsRemaining: number;
  chatLocked: boolean;
}

export function resolveChatAllowance({
  dailyLimit,
  usage,
  purchasedCredits,
  fallbackUsedToday,
  mockExtraQuestions = 0,
  unmetered = false,
}: ChatAllowanceInput): ChatAllowance {
  // A ledger that doesn't exist is not a ledger reading zero — see
  // `ChatUsage.hasLedger`. Reading the absent document as "nothing used yet"
  // is what pinned the counter at a full allowance.
  const questionsUsed = usage?.hasLedger ? usage.usedToday : fallbackUsedToday;

  // Purchased questions are a separate, non-expiring bucket the server draws
  // from once the daily allowance is gone — both sides count them the same
  // way: everything ever bought, minus everything ever spent.
  const creditsLeft =
    Math.max(0, purchasedCredits - (usage?.creditsConsumed ?? 0)) +
    mockExtraQuestions;

  const questionLimit = dailyLimit + creditsLeft;
  const questionsRemaining =
    Math.max(0, dailyLimit - questionsUsed) + creditsLeft;

  return {
    questionsUsed,
    unmetered,
    creditsLeft,
    questionLimit,
    questionsRemaining,
    chatLocked: !unmetered && questionsRemaining <= 0,
  };
}
