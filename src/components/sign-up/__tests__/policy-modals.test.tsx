import React from 'react';
import { Modal } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import PolicyModal from '@/src/components/sign-up/policy-modals';

const POLICY = `# Privacy Policy

We respect your privacy. See the [Terms of Service](#terms-of-service).

## Data we collect

Birth details.`;

const renderModal = (onClose = jest.fn(), onLinkPress = jest.fn()) =>
  render(
    <PolicyModal
      visible
      onClose={onClose}
      title="Privacy Policy"
      textContent={POLICY}
      onLinkPress={onLinkPress}
    />,
  );

describe('PolicyModal', () => {
  // Without onRequestClose the Android back button did nothing here.
  it('closes on the Android back button', () => {
    const onClose = jest.fn();
    renderModal(onClose);

    screen.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('names Close by what it closes', () => {
    const onClose = jest.fn();
    renderModal(onClose);

    fireEvent.press(screen.getByRole('button', { name: 'Close Privacy Policy' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Rendered as plain views and text, so the rotor couldn't jump sections or find links.
  it('exposes markdown headings and links to assistive tech', () => {
    const onLinkPress = jest.fn();
    renderModal(jest.fn(), onLinkPress);

    expect(screen.getAllByRole('header', { name: 'Privacy Policy' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('header', { name: 'Data we collect' })).toBeTruthy();

    fireEvent.press(screen.getByRole('link', { name: 'Terms of Service' }));
    expect(onLinkPress).toHaveBeenCalledWith('#terms-of-service');
  });
});
