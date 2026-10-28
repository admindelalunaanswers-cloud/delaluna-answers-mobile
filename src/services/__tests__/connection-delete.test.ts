import { httpsCallable } from 'firebase/functions';

import { Events } from '@/src/services/analytics.service';
import { deleteConnection } from '@/src/services/connection.service';
import { ConnectionsCache } from '@/src/services/connections-cache.service';

jest.mock('@/firebaseConfig', () => ({ db: {}, functions: { __mock: 'functions' } }));
// connection.service's other exports pull these in at module scope.
jest.mock('@/src/services/astroEngine', () => ({ calculateNatalChart: jest.fn() }));
jest.mock('@/src/services/synastry-reading.service', () => ({ requestSynastryReading: jest.fn() }));
jest.mock('@/src/services/analytics.service', () => ({ Events: { connectionDeleted: jest.fn() } }));
jest.mock('@/src/services/connections-cache.service', () => ({
  ConnectionsCache: { remove: jest.fn(() => Promise.resolve()) },
}));

const callable = jest.fn();

/**
 * The Edit Connection screen used to `deleteDoc` directly, skipping the cache
 * (so the connection could reappear in the list) and the analytics event that
 * the Connections list's path recorded. Both screens now call this.
 */
describe('deleteConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (httpsCallable as jest.Mock).mockReturnValue(callable);
  });

  it('deletes through the Cloud Function, then clears the cache and counts it', async () => {
    callable.mockResolvedValue({ data: { deleted: true } });

    await deleteConnection('uid-1', 'c1');

    expect(httpsCallable).toHaveBeenCalledWith({ __mock: 'functions' }, 'deleteConnection');
    expect(callable).toHaveBeenCalledWith({ userId: 'uid-1', connectionId: 'c1' });
    expect(ConnectionsCache.remove).toHaveBeenCalledWith('uid-1', 'c1');
    expect(Events.connectionDeleted).toHaveBeenCalledTimes(1);
  });

  it('touches neither the cache nor analytics when the call fails', async () => {
    callable.mockRejectedValue(new Error('permission-denied'));

    await expect(deleteConnection('uid-1', 'c1')).rejects.toThrow('permission-denied');
    expect(ConnectionsCache.remove).not.toHaveBeenCalled();
    expect(Events.connectionDeleted).not.toHaveBeenCalled();
  });
});
