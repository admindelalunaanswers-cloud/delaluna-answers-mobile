import React from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import ChatExportSheet from '@/src/components/chat/chat-export-sheet';
import { Events } from '@/src/services/analytics.service';
import type { ExportableChat } from '@/src/utils/chat-export-format';

jest.mock('@/src/services/analytics.service', () => ({
  Events: { chatExported: jest.fn() },
}));
jest.mock('@/src/services/crashlytics.service', () => ({ recordError: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const CHAT: ExportableChat = {
  title: 'How does a new love interest affect my current relationship?',
  date: new Date('2026-10-21T15:00:00Z'),
  turns: [
    {
      question: 'How does a new love interest affect my current relationship?',
      answer: 'Well, look at you.',
      askedAt: new Date('2026-10-21T15:00:00Z'),
      mode: 'astrology',
    },
  ],
};

const BIRTH = 'Born Mar 4, 1994 · 2:05 PM · Chicago, IL';

const renderSheet = (props: Partial<React.ComponentProps<typeof ChatExportSheet>> = {}) => {
  const onClose = jest.fn();
  render(
    <ChatExportSheet
      visible
      chat={CHAT}
      birthDetails={BIRTH}
      source="chat"
      onClose={onClose}
      {...props}
    />,
  );
  return { onClose };
};

const press = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
};

describe('ChatExportSheet', () => {
  let announce: jest.SpyInstance;
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    announce.mockRestore();
    alertSpy.mockRestore();
  });

  it('shows the chat it is exporting', () => {
    renderSheet();

    expect(screen.getByRole('header', { name: 'Export chat' })).toBeTruthy();
    expect(screen.getByText(CHAT.title)).toBeTruthy();
    expect(screen.getByText('Astrology · Oct 21, 2026 · 2 messages')).toBeTruthy();
  });

  it('presents the formats as a radio group, PDF first selected', () => {
    renderSheet();

    expect(screen.getByRole('radio', { name: /^PDF/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Copy as text/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /^Image/ })).not.toBeChecked();
  });

  it('names the main button after the chosen format', () => {
    renderSheet();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeTruthy();

    fireEvent.press(screen.getByRole('radio', { name: /^Copy as text/ }));
    expect(screen.getByRole('button', { name: 'Copy text' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^Copy as text/ })).toBeChecked();

    fireEvent.press(screen.getByRole('radio', { name: /^Image/ }));
    expect(screen.getByRole('button', { name: 'Share image' })).toBeTruthy();
  });

  it('includes questions by default and birth details only when switched on', () => {
    renderSheet();

    expect(screen.getByRole('switch', { name: 'Your questions' }).props.value).toBe(true);
    expect(screen.getByRole('switch', { name: 'Birth details' }).props.value).toBe(false);
  });

  it('hides the birth details switch when the profile has none', () => {
    renderSheet({ birthDetails: null });

    expect(screen.queryByRole('switch', { name: 'Birth details' })).toBeNull();
  });

  it('copies the chat, says so, and closes', async () => {
    jest.useFakeTimers();
    const { onClose } = renderSheet();
    fireEvent.press(screen.getByRole('radio', { name: /^Copy as text/ }));

    await press('Copy text');

    const copied = (Clipboard.setStringAsync as jest.Mock).mock.calls[0][0] as string;
    expect(copied).toContain('Well, look at you.');
    expect(copied).not.toContain('Born');
    expect(announce).toHaveBeenCalledWith('Chat copied to clipboard');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeDisabled();

    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(onClose).toHaveBeenCalled();
  });

  // The auto-close was only cleared on unmount, and the sheet stays mounted —
  // so it closed whatever sheet was open 1.2s after a copy.
  it("does not let a copy's auto-close shut a sheet reopened in time", async () => {
    jest.useFakeTimers();
    const { onClose } = renderSheet();
    fireEvent.press(screen.getByRole('radio', { name: /^Copy as text/ }));
    await press('Copy text');

    // Closed by hand straight away, then reopened (here on a saved chat).
    screen.rerender(
      <ChatExportSheet visible={false} chat={CHAT} birthDetails={BIRTH} source="chat" onClose={onClose} />,
    );
    screen.rerender(
      <ChatExportSheet visible chat={CHAT} birthDetails={BIRTH} source="history" onClose={onClose} />,
    );
    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('header', { name: 'Export chat' })).toBeTruthy();
  });

  // The visible caption and the Switch's own label were both read.
  it('reads each switch once', () => {
    renderSheet();

    expect(screen.queryByText('Your questions')).toBeNull();
    expect(screen.queryByText('Birth details')).toBeNull();
    expect(screen.getByText('Your questions', { includeHiddenElements: true })).toBeTruthy();
  });

  it('prints a letter-size PDF and opens the share sheet', async () => {
    const { onClose } = renderSheet();

    await press('Export PDF');

    expect(Print.printToFileAsync).toHaveBeenCalledWith(
      expect.objectContaining({ width: 612, height: 792 }),
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
    expect(Events.chatExported).toHaveBeenCalledWith({
      format: 'pdf',
      source: 'chat',
      includeQuestions: true,
      includeBirthDetails: false,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('leaves the questions out of the PDF when switched off', async () => {
    renderSheet();
    fireEvent(screen.getByRole('switch', { name: 'Your questions' }), 'valueChange', false);

    await press('Export PDF');

    const { html } = (Print.printToFileAsync as jest.Mock).mock.calls[0][0];
    expect(html).not.toContain('new love interest');
  });

  it('adds birth details to the PDF only once switched on', async () => {
    renderSheet();
    fireEvent(screen.getByRole('switch', { name: 'Birth details' }), 'valueChange', true);

    await press('Export PDF');

    const { html } = (Print.printToFileAsync as jest.Mock).mock.calls[0][0];
    expect(html).toContain('Chicago, IL');
  });

  it('captures the story card at 1080×1920 and shares it', async () => {
    renderSheet();
    fireEvent.press(screen.getByRole('radio', { name: /^Image/ }));

    await press('Share image');

    expect(captureRef).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ format: 'png', width: 1080, height: 1920 }),
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/card.png',
      expect.objectContaining({ mimeType: 'image/png' }),
    );
  });

  it('says so when the device cannot share, and stays open', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    const { onClose } = renderSheet();

    await press('Export PDF');

    expect(alertSpy).toHaveBeenCalledWith('Sharing unavailable', expect.any(String));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('starts over with birth details off every time it opens', () => {
    const { onClose } = renderSheet();
    fireEvent(screen.getByRole('switch', { name: 'Birth details' }), 'valueChange', true);

    screen.rerender(
      <ChatExportSheet visible={false} chat={CHAT} birthDetails={BIRTH} source="chat" onClose={onClose} />,
    );
    screen.rerender(
      <ChatExportSheet visible chat={CHAT} birthDetails={BIRTH} source="chat" onClose={onClose} />,
    );

    expect(screen.getByRole('switch', { name: 'Birth details' }).props.value).toBe(false);
  });
});
