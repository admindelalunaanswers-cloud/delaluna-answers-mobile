import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import PaygateOverlay from '@/src/components/shared/paygate-overlay.component';

jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: View };
});
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const PREMIUM_TEXT = "Tomorrow's reading: a stranger brings news.";

const renderOverlay = (locked: boolean, onUnlock = jest.fn()) =>
  render(
    <PaygateOverlay
      locked={locked}
      onUnlock={onUnlock}
      unlockTitle="Unlock Past & Future Readings"
      unlockMessage="Upgrade to Premium."
    >
      <Text>{PREMIUM_TEXT}</Text>
    </PaygateOverlay>,
  );

describe('PaygateOverlay', () => {
  /**
   * The blur hid the content from sight only. VoiceOver / TalkBack still read
   * it in full, so a free user with a screen reader on heard the premium
   * reading — and anyone could, by turning one on.
   */
  it('hides locked content from assistive tech', () => {
    renderOverlay(true);

    // RNTL leaves out elements hidden from accessibility by default…
    expect(screen.queryByText(PREMIUM_TEXT)).toBeNull();
    // …but it is still rendered underneath, for the visual tease.
    expect(screen.getByText(PREMIUM_TEXT, { includeHiddenElements: true })).toBeTruthy();
  });

  /**
   * RNTL also treats accessibilityViewIsModal on the blur as hiding its
   * siblings — true on iOS, but Android ignores that prop. Pin each platform's
   * own mechanism so neither half can be dropped unnoticed.
   */
  it('hides it on both platforms, not just iOS', () => {
    renderOverlay(true);

    // Nearest ancestor that sets either prop — `.parent` walks composite
    // nodes too, so a fixed number of hops is brittle.
    let wrapper = screen.getByText(PREMIUM_TEXT, { includeHiddenElements: true }).parent;
    while (
      wrapper &&
      wrapper.props.importantForAccessibility === undefined &&
      wrapper.props.accessibilityElementsHidden === undefined
    ) {
      wrapper = wrapper.parent;
    }
    expect(wrapper?.props.importantForAccessibility).toBe('no-hide-descendants'); // Android
    expect(wrapper?.props.accessibilityElementsHidden).toBe(true); // iOS
  });

  it('exposes the content once unlocked', () => {
    renderOverlay(false);

    expect(screen.getByText(PREMIUM_TEXT)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unlock Now' })).toBeNull();
  });

  it('offers the unlock as a named button under a heading', () => {
    const onUnlock = jest.fn();
    renderOverlay(true, onUnlock);

    expect(screen.getByRole('header', { name: 'Unlock Past & Future Readings' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Unlock Now' }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });
});
