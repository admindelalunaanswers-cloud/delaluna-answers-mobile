import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';

import { useWhatsNew } from '@/src/hooks/use-whats-new';

// Same object every render — see "Mocked hooks" in CLAUDE.md. Reassigned only
// to simulate a new user-doc snapshot.
const makeUser = () => ({
  authUser: { uid: 'u1', emailVerified: true },
  // Before the release, so the sheet is due.
  userDoc: { firstName: 'Maya', createdAt: new Date(2026, 0, 1) },
});
let mockUser = makeUser();
jest.mock('@/src/context/user-context', () => ({ useUser: () => mockUser }));

jest.mock('@/src/context/revenuecat-context', () => {
  const value = { hasFullAccess: false, loading: false };
  return { useRevenueCat: () => value };
});

jest.mock('@/src/services/analytics.service', () => ({
  Events: { whatsNewShown: jest.fn(), whatsNewDismissed: jest.fn(), whatsNewCta: jest.fn() },
}));

describe('useWhatsNew', () => {
  beforeEach(() => {
    mockUser = makeUser();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('shows the sheet to an account from before the release', async () => {
    const { result } = renderHook(() => useWhatsNew(true));
    await act(async () => {});
    expect(result.current.visible).toBe(true);
  });

  // A new user-doc snapshot while the storage read is in flight cancels that
  // read. The re-run must still decide, or the sheet never shows.
  it('still shows when the user doc updates mid-decision', async () => {
    let resolveRead: (raw: string | null) => void = () => {};
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => { resolveRead = resolve; }),
    );
    const { result, rerender } = renderHook(() => useWhatsNew(true));
    await act(async () => {});

    mockUser = { ...mockUser, userDoc: { ...mockUser.userDoc } };
    rerender({});
    await act(async () => {});
    await act(async () => resolveRead(null));

    expect(result.current.visible).toBe(true);
  });
});
