import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';

import {
  AdminProvider,
  DEFAULT_DAILY_CHAT_LIMIT,
  DEFAULT_PREMIUM_DAILY_CHAT_LIMIT,
  useAdmin,
} from '@/src/context/admin-context';

// What an admin once saved on this device, swapped as it was found on a test
// simulator: free 5, premium 2.
const STORED = {
  dailyChatLimit: 5,
  premiumDailyChatLimit: 2,
  freeConnectionLimit: 0,
  trialConnectionLimit: 3,
  premiumConnectionLimit: 10,
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn(() => Promise.resolve(JSON.stringify(STORED))),
    setItem: jest.fn(() => Promise.resolve()),
  },
}));

const mockRevenueCat = { isAdmin: false };
jest.mock('@/src/context/revenuecat-context', () => ({
  useRevenueCat: () => mockRevenueCat,
}));

function Limits() {
  const { dailyChatLimit, premiumDailyChatLimit } = useAdmin();
  return <Text>{`${dailyChatLimit}/${premiumDailyChatLimit}`}</Text>;
}

describe('AdminProvider', () => {
  // The overrides are per device, so they outlived a sign-out and became a
  // non-admin's counter, which then disagreed with the server.
  it("ignores an admin's saved limits for anyone else", async () => {
    mockRevenueCat.isAdmin = false;
    render(
      <AdminProvider>
        <Limits />
      </AdminProvider>,
    );

    // Let the stored values load before asserting they were ignored.
    await waitFor(() =>
      expect(jest.requireMock('@react-native-async-storage/async-storage').default.getItem).toHaveBeenCalled(),
    );
    expect(
      screen.getByText(`${DEFAULT_DAILY_CHAT_LIMIT}/${DEFAULT_PREMIUM_DAILY_CHAT_LIMIT}`),
    ).toBeTruthy();
  });

  it('applies them for an admin', async () => {
    mockRevenueCat.isAdmin = true;
    render(
      <AdminProvider>
        <Limits />
      </AdminProvider>,
    );

    expect(await screen.findByText('5/2')).toBeTruthy();
  });
});
