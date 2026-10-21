import React, { useState } from 'react';
import { AccessibilityInfo, Keyboard } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import ChatFlow, { type StepConfig } from '@/src/components/sign-up/chat-flow';

jest.mock('@/src/assets/legal/legal-texts', () => ({ privacyPolicy: '', termsAndConditions: '' }));
jest.mock('@/src/components/sign-up/policy-modals', () => () => null);
jest.mock('@/src/utils/location', () => ({
  searchNominatim: jest.fn(() => Promise.resolve([])),
  formatPlace: (r: { display_name: string }) => r.display_name,
  detectTimezoneOffset: jest.fn(() => Promise.resolve(0)),
}));
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// jest.setup.js mocks NativeEventEmitter, so Keyboard.addListener returns
// undefined and KeyboardAvoidingView throws removing it on unmount.
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View };
});

const STEPS: StepConfig[] = [
  { key: 'firstName', inputType: 'text', placeholder: 'First name…' },
  { key: 'pronouns', inputType: 'choices', choices: ['She/Her', 'He/Him', 'They/Them', 'Non Binary'] },
  { key: 'final', inputType: 'final' },
];

function Harness() {
  const [step, setStep] = useState(0);
  return <ChatFlow steps={STEPS} onComplete={jest.fn()} step={step} setStep={setStep} />;
}

const answerFirstName = async () => {
  // Anchored: the question bubble's label ("Delaluna: Hey…") contains it too.
  fireEvent.changeText(screen.getByLabelText(/^Hey, I'm glad you're here/), 'Luna');
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  });
};

describe('ChatFlow', () => {
  let announce: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    // jest.setup.js stubs NativeEventEmitter, so the real addListener returns nothing to remove.
    jest.spyOn(Keyboard, 'addListener').mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    announce.mockRestore();
  });

  // No field to focus on a choices step, and the Next button that had focus is gone.
  it('announces the new question when there is nothing to focus', async () => {
    render(<Harness />);
    await answerFirstName();

    expect(announce).toHaveBeenCalledWith('What are your pronouns, Luna?');
  });

  // Selection was only a fill.
  it('offers pronouns as radios under the question', async () => {
    render(<Harness />);
    await answerFirstName();

    expect(screen.getByLabelText('What are your pronouns, Luna?', { exact: true })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('radio', { name: 'They/Them' }).props.accessibilityState?.checked).toBe(false);
  });

  // Bubble side and colour were the only signal of who said what.
  it('says who is speaking in the history', async () => {
    render(<Harness />);
    await answerFirstName();

    expect(screen.getByLabelText(/^Delaluna: Hey, I'm glad you're here/)).toBeTruthy();
    expect(screen.getByLabelText('You: Luna')).toBeTruthy();
    expect(screen.getByLabelText('Delaluna: What are your pronouns, Luna?')).toBeTruthy();
  });

  it('says why Get Started is disabled', async () => {
    render(<Harness />);
    await answerFirstName();
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'She/Her' }));
    });

    const start = screen.getByRole('button', { name: 'Get Started' });
    expect(start).toBeDisabled();
    expect(start.props.accessibilityHint).toBe('Agree to the Terms and the Privacy Policy first');
  });
});
