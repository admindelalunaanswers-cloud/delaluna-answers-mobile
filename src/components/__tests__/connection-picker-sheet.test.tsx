import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { onSnapshot } from 'firebase/firestore';

import ConnectionPickerSheet from '@/src/components/connection-picker-sheet';

jest.mock('@/firebaseConfig', () => ({ db: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const renderSheet = async () => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  render(<ConnectionPickerSheet visible uid="uid-1" onClose={onClose} onSelect={onSelect} />);
  return { onSelect, onClose };
};

const deliver = async (docs: object[]) => {
  const onNext = (onSnapshot as jest.Mock).mock.calls.at(-1)[1];
  await act(async () => {
    onNext({ docs: docs.map((d: any) => ({ id: d.id, data: () => d })) });
  });
};

describe('ConnectionPickerSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (onSnapshot as jest.Mock).mockReturnValue(jest.fn());
  });

  it('names Close and marks the title as a heading', async () => {
    const { onClose } = await renderSheet();

    expect(screen.getByRole('header', { name: 'Talk about a connection' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('lists connections as buttons', async () => {
    const { onSelect } = await renderSheet();
    await deliver([{ id: 'c1', firstPerson: { firstName: 'Luna' }, secondPerson: { firstName: 'Sol' }, relationshipType: 'Romantic' }]);

    fireEvent.press(screen.getByRole('button', { name: /Sol/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', name: 'Sol' }));
  });

  // Tap-outside-to-close was an empty, unnamed element to a screen reader.
  it('keeps the backdrop out of the screen-reader order', async () => {
    await renderSheet();
    await deliver([]);

    // No accessibility element without a role or name — the backdrop was one.
    const unnamed = screen.UNSAFE_root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        n.props.accessible === true &&
        !n.props.accessibilityRole &&
        !n.props.accessibilityLabel,
    );
    expect(unnamed).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Go to Connections' })).toBeTruthy();
  });
});
