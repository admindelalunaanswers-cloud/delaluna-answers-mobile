import type { CustomerInfo } from 'react-native-purchases';

import { PRODUCT_IDS, purchasedChatCredits } from '@/src/services/revenuecat.service';

// The service reads its API key from expo-constants at module load; the shared
// setup mock has no default export, so give it one here.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

/**
 * Counterpart to `purchasedChatCredits()` in functions/src/index.ts, which
 * counts the same purchases from the RevenueCat Firestore mirror. The two must
 * agree, or the counter promises questions the server then refuses.
 */
describe('purchasedChatCredits', () => {
  const withTransactions = (productIdentifiers: string[]) =>
    ({
      nonSubscriptionTransactions: productIdentifiers.map((id, i) => ({
        productIdentifier: id,
        purchaseDate: `2026-03-0${i + 1}T00:00:00Z`,
        transactionIdentifier: `tx-${i}`,
      })),
    }) as unknown as CustomerInfo;

  it('returns zero when nothing has been bought', () => {
    expect(purchasedChatCredits(withTransactions([]))).toBe(0);
  });

  it('grants the pack quantity, not one per purchase', () => {
    expect(purchasedChatCredits(withTransactions([PRODUCT_IDS.chatPack5]))).toBe(5);
  });

  it('counts one entry per purchase, so buying the same pack twice grants twice', () => {
    expect(
      purchasedChatCredits(
        withTransactions([PRODUCT_IDS.chatPack3, PRODUCT_IDS.chatPack3]),
      ),
    ).toBe(6);
  });

  it('sums across different packs', () => {
    expect(
      purchasedChatCredits(
        withTransactions([
          PRODUCT_IDS.chatPack1,
          PRODUCT_IDS.chatPack3,
          PRODUCT_IDS.chatPack10,
        ]),
      ),
    ).toBe(14);
  });

  it('ignores non-subscription purchases that are not chat packs', () => {
    expect(
      purchasedChatCredits(
        withTransactions(['delaluna.iap.something_else', PRODUCT_IDS.chatPack1]),
      ),
    ).toBe(1);
  });
});
