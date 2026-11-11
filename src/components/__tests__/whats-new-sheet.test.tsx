import React from 'react';
import { Modal } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import WhatsNewSheet from '@/src/components/whats-new-sheet';
import type { WhatsNewItem, WhatsNewRelease } from '@/src/constants/whats-new';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let mockReduceMotion = false;
jest.mock('@/src/context/accessibility-context', () => ({
  useReducedMotion: () => mockReduceMotion,
  useFontScale: () => 1,
}));

const ITEMS: WhatsNewItem[] = [
  {
    id: 'switch_readers',
    icon: 'swap-horizontal-outline',
    audience: 'all',
    title: 'Switch readers mid-chat',
    body: 'Ask the tarot reader a follow-up.',
    cta: { label: 'Open chat', route: '/(main)/chat' },
  },
  {
    id: 'accessibility_settings',
    icon: 'text-outline',
    audience: 'all',
    title: 'Text size and motion settings',
    body: 'From Profile → Accessibility.',
  },
];

const RELEASE: WhatsNewRelease = {
  id: '3.0.0',
  releasedAt: 0,
  versionLabel: 'Version 3.0',
  title: "What's new in Delaluna",
  subtitle: 'Since you last visited.',
  items: ITEMS,
};

const renderSheet = () => {
  const onClose = jest.fn();
  const onItemPress = jest.fn();
  render(
    <WhatsNewSheet visible release={RELEASE} items={ITEMS} onClose={onClose} onItemPress={onItemPress} />,
  );
  return { onClose, onItemPress };
};

describe('WhatsNewSheet', () => {
  beforeEach(() => {
    mockReduceMotion = false;
  });

  it('marks the title as a heading', () => {
    renderSheet();
    expect(screen.getByRole('header', { name: "What's new in Delaluna" })).toBeTruthy();
  });

  it('reads each item as one element, title then body', () => {
    renderSheet();
    expect(
      screen.getByLabelText('Switch readers mid-chat. Ask the tarot reader a follow-up.'),
    ).toBeTruthy();
  });

  it('names each link after its item, and only items with one get a link', () => {
    const { onItemPress } = renderSheet();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);

    fireEvent.press(screen.getByRole('link', { name: 'Open chat: Switch readers mid-chat' }));
    expect(onItemPress).toHaveBeenCalledWith(ITEMS[0]);
  });

  it('closes from Got it, and from the Android back button', () => {
    const { onClose } = renderSheet();

    fireEvent.press(screen.getByRole('button', { name: 'Got it' }));
    expect(onClose).toHaveBeenLastCalledWith('button');

    screen.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onClose).toHaveBeenLastCalledWith('back');
  });

  it('keeps the backdrop out of the screen-reader order', () => {
    renderSheet();
    const unnamed = screen.UNSAFE_root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        n.props.accessible === true &&
        !n.props.accessibilityRole &&
        !n.props.accessibilityLabel,
    );
    expect(unnamed).toHaveLength(0);
  });

  it('is announced as a modal on iOS', () => {
    renderSheet();
    const modalViews = screen.UNSAFE_root.findAll(
      (n) => typeof n.type === 'string' && n.props.accessibilityViewIsModal === true,
    );
    expect(modalViews.length).toBeGreaterThan(0);
  });

  it('fades instead of sliding under Reduce Motion', () => {
    renderSheet();
    expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('slide');

    mockReduceMotion = true;
    renderSheet();
    expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('fade');
  });
});
