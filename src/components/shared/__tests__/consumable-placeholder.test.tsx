import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Purchases from 'react-native-purchases';

import ConsumablePlaceholder from '@/src/components/shared/consumable-placeholder.component';
import { purchaseProduct } from '@/src/services/revenuecat.service';

jest.mock('react-native-purchases', () => ({ __esModule: true, default: { getProducts: jest.fn() } }));
jest.mock('@/src/services/revenuecat.service', () => ({
  REVENUECAT_ENABLED: true,
  PRODUCT_IDS: {
    chatPack1: 'delaluna.iap.chat_pack_1',
    chatPack3: 'delaluna.iap.chat_pack_3',
    chatPack5: 'delaluna.iap.chat_pack_5',
    chatPack10: 'delaluna.iap.chat_pack_10',
  },
  purchaseProduct: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/src/services/analytics.service', () => ({
  Events: { purchaseCompleted: jest.fn(), purchaseFailed: jest.fn() },
}));
jest.mock('@/src/services/crashlytics.service', () => ({ recordError: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const product = (id: string, price: string) => ({ identifier: id, priceString: price });
const ALL = [
  product('delaluna.iap.chat_pack_1', '$1.29'),
  product('delaluna.iap.chat_pack_3', '$3.49'),
  product('delaluna.iap.chat_pack_5', '$4.99'),
  product('delaluna.iap.chat_pack_10', '$9.99'),
];

const renderSheet = async (props: Partial<React.ComponentProps<typeof ConsumablePlaceholder>> = {}) => {
  const onClose = jest.fn();
  const onPurchased = jest.fn();
  render(<ConsumablePlaceholder visible onClose={onClose} onPurchased={onPurchased} {...props} />);
  await act(async () => {}); // product fetch
  return { onClose, onPurchased };
};

describe('ConsumablePlaceholder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Purchases.getProducts as jest.Mock).mockResolvedValue(ALL);
  });

  /**
   * The card and backdrop were Pressables, which are accessibility elements by
   * default — they collapsed the sheet into one VoiceOver element, so no pack,
   * Buy now or Close could be reached.
   */
  it('exposes each pack as a radio with its real price', async () => {
    await renderSheet();

    expect(screen.getByLabelText('Question packs')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '3 Questions, $3.49' }).props.accessibilityState?.checked).toBe(true);
    fireEvent.press(screen.getByRole('radio', { name: '10 Questions, $9.99' }));
    expect(screen.getByRole('radio', { name: '10 Questions, $9.99' }).props.accessibilityState?.checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Ask More Questions' })).toBeTruthy();
  });

  it('does not wrap the sheet in an accessibility element', async () => {
    await renderSheet();

    let node = screen.getByRole('button', { name: 'Buy now' }).parent;
    while (node) {
      if ((node.type as unknown) === 'View') expect(node.props.accessible).not.toBe(true);
      node = node.parent;
    }
  });

  it('buys the selected pack and keeps Buy now named while it works', async () => {
    let finish!: () => void;
    (purchaseProduct as jest.Mock).mockReturnValue(new Promise<void>((r) => { finish = r; }));
    const { onClose, onPurchased } = await renderSheet();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Buy now' }));
    });
    expect(screen.getByRole('button', { name: 'Buy now' }).props.accessibilityState?.busy).toBe(true);

    await act(async () => { finish(); });
    expect(purchaseProduct).toHaveBeenCalledWith(ALL[1]);
    expect(onPurchased).toHaveBeenCalledWith(3);
    expect(onClose).toHaveBeenCalled();
  });

  // It used to "buy" silently — closing with nothing bought — behind
  // placeholder prices the store never offered.
  describe('when the store cannot sell', () => {
    beforeEach(() => {
      (Purchases.getProducts as jest.Mock).mockRejectedValue(new Error('store down'));
    });

    it('says so, shows no made-up prices, and does not pretend to buy', async () => {
      const { onClose, onPurchased } = await renderSheet();

      expect(screen.getByText("The store isn't available right now. Please try again later.")).toBeTruthy();
      expect(screen.queryByText('$2.99')).toBeNull();
      expect(screen.getByRole('radio', { name: '3 Questions' })).toBeTruthy();

      const buy = screen.getByRole('button', { name: 'Buy now' });
      expect(buy).toBeDisabled();
      // RNTL passes a disabled press up to the card's onPress, which stops propagation.
      fireEvent.press(buy, { stopPropagation: () => {} });
      expect(onPurchased).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('still mocks the purchase in a dev build', async () => {
      const { onClose, onPurchased } = await renderSheet({ allowMock: true });

      expect(screen.getByRole('radio', { name: '3 Questions, $2.99' })).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Buy now' }));
      });
      expect(onPurchased).toHaveBeenCalledWith(3);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
