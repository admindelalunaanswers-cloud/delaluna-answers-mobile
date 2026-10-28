import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import DateSwitcher from '@/src/components/home/date-switcher.component';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const DATES = ['2026-10-20', '2026-10-21', '2026-10-22'];

describe('DateSwitcher', () => {
  let announce: jest.SpyInstance;

  beforeEach(() => {
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    announce.mockRestore();
  });

  // The arrows were icon-only, so VoiceOver read both as an unnamed "button".
  it('names both arrows', () => {
    render(<DateSwitcher value={DATES[1]} dates={DATES} onChange={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Previous day' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeTruthy();
  });

  it('reports an arrow as disabled at the end of the range', () => {
    render(<DateSwitcher value={DATES[0]} dates={DATES} onChange={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Previous day' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled();
  });

  it('moves to the neighbouring date', () => {
    const onChange = jest.fn();
    render(<DateSwitcher value={DATES[1]} dates={DATES} onChange={onChange} />);

    fireEvent.press(screen.getByRole('button', { name: 'Next day' }));
    expect(onChange).toHaveBeenCalledWith(DATES[2]);
  });

  // Focus stays on the arrow, so the new date was never read out.
  it('announces the new date when it changes, but not on mount', () => {
    const { rerender } = render(
      <DateSwitcher value={DATES[1]} dates={DATES} onChange={jest.fn()} />,
    );
    expect(announce).not.toHaveBeenCalled();

    rerender(<DateSwitcher value={DATES[2]} dates={DATES} onChange={jest.fn()} />);
    expect(announce).toHaveBeenCalledWith('October 22, 2026');
  });
});
