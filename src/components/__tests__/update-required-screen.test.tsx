import React from 'react';
import { Alert, Linking } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { UpdateRequiredScreen } from '@/src/components/update-required-screen';

describe('UpdateRequiredScreen', () => {
  let openURL: jest.SpyInstance;
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    openURL.mockRestore();
    alertSpy.mockRestore();
  });

  it('marks the title as a heading and the button as a button', () => {
    render(<UpdateRequiredScreen storeUrl="https://example.com/app" installedVersion="1.0.0" />);

    expect(screen.getByRole('header', { name: 'Update required' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open the App Store' })).toBeTruthy();
  });

  it('uses the store URL from the min-version config when there is one', async () => {
    render(<UpdateRequiredScreen storeUrl="https://example.com/app" installedVersion="1.0.0" />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Open the App Store' }));
    });
    expect(openURL).toHaveBeenCalledWith('https://example.com/app');
  });

  // With no URL in the config there was no button at all — everyone on the old
  // build was stranded.
  it('falls back to the real store listing when the config has no URL', async () => {
    render(<UpdateRequiredScreen storeUrl={null} installedVersion="1.0.0" />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Open the App Store' }));
    });
    expect(openURL).toHaveBeenCalledWith('itms-apps://apps.apple.com/app/id6764196892');
  });

  it('tries the web listing, then says what to do, if nothing opens', async () => {
    openURL.mockRejectedValue(new Error('cannot open'));
    render(<UpdateRequiredScreen storeUrl={null} installedVersion="1.0.0" />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Open the App Store' }));
    });
    expect(openURL).toHaveBeenLastCalledWith('https://apps.apple.com/app/id6764196892');
    expect(alertSpy).toHaveBeenCalledWith('Update required', expect.stringContaining('the App Store'));
  });
});
