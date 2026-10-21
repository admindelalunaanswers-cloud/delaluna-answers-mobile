import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import TarotCardImageFrame from '@/src/components/home/tarot-card-image-view.component';

jest.mock('react-native-reanimated', () => require('@/test-utils/reanimated-mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const renderSpread = (onReveal = jest.fn()) =>
  render(
    <TarotCardImageFrame
      cardNumber={[0, 16]}
      reversed={[false, true]}
      names={['The Fool', 'The Tower']}
      onReveal={onReveal}
    />,
  );

describe('TarotCardImageFrame', () => {
  let announce: jest.SpyInstance;

  beforeEach(() => {
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    announce.mockRestore();
  });

  it('keeps the cards face down to a screen reader until revealed', () => {
    renderSpread();

    expect(screen.getByRole('image', { name: 'Card 1, face down' })).toBeTruthy();
    expect(screen.queryByRole('image', { name: 'The Fool' })).toBeNull();
  });

  /**
   * The faces are images, so a screen-reader user used to tap "Tap to Reveal
   * Cards" and never learn what they drew.
   */
  it('names each card, and says which are reversed, once revealed', () => {
    const onReveal = jest.fn();
    renderSpread(onReveal);

    fireEvent.press(screen.getByRole('button', { name: 'Tap to Reveal Cards' }));

    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('image', { name: 'The Fool' })).toBeTruthy();
    expect(screen.getByRole('image', { name: 'The Tower, reversed' })).toBeTruthy();
    // The button that had focus is gone, so the draw is announced too.
    expect(announce).toHaveBeenCalledWith('Your cards: The Fool; The Tower, reversed');
  });

  it('marks the shop links as links that leave the app', () => {
    renderSpread();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0].props.accessibilityHint).toBe('Opens Amazon in your browser');
  });
});
