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
   * Message-derived count used only until the ledger loads — showing a full
   * allowance in that gap would invite a send the server then rejects.
   */
  fallbackUsedToday: number;
  /**
   * Questions handed out by the fallback sheet when RevenueCat can't sell.
   * No transaction stands behind them, so the server won't honour them; they
   * exist so the placeholder still demoes in a build without RevenueCat.
   */
  mockExtraQuestions?: number;
}

export interface ChatAllowance {
  questionsUsed: number;
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
}: ChatAllowanceInput): ChatAllowance {
  const questionsUsed = usage?.usedToday ?? fallbackUsedToday;

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
    creditsLeft,
    questionLimit,
    questionsRemaining,
    chatLocked: questionsRemaining <= 0,
  };
}
