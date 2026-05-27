// ─── Mocks (must be before importing service) ─────────────────────────────────

jest.mock('firebase/firestore', () => ({
  addDoc: jest.fn().mockResolvedValue({ id: 'auto-id' }),
  setDoc: jest.fn().mockResolvedValue(undefined),
  collection: jest.fn().mockReturnValue('mock-col'),
  doc: jest.fn().mockReturnValue('mock-doc'),
  serverTimestamp: jest.fn().mockReturnValue('MOCK_SERVER_TS'),
}));

jest.mock('@/firebaseConfig', () => ({ db: {} }));

jest.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.2.3' } },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('@/src/constants/env', () => ({ APP_ENV: 'development' }));

jest.mock('@/src/services/analytics.service', () => ({
  screenLabelForPath: (p: string) => {
    const map: Record<string, string> = {
      '/(main)/chat': 'Chat',
      '/(main)/index': 'Birth Data Input',
      '/(home)/birth-chart-view': 'Birth Chart',
    };
    return map[p] ?? 'Unknown';
  },
}));

import { logScreenLoad, logOperation, logError, screenSlugForPath } from '@/src/services/perf-log.service';
import { addDoc, setDoc, collection, doc, serverTimestamp } from 'firebase/firestore';

// ─── screenSlugForPath ────────────────────────────────────────────────────────

describe('screenSlugForPath', () => {
  it('converts label to lowercase slug', () => {
    expect(screenSlugForPath('/(main)/chat')).toBe('chat');
  });

  it('replaces spaces with dashes', () => {
    expect(screenSlugForPath('/(main)/index')).toBe('birth-data-input');
  });

  it('strips non-alphanumeric chars', () => {
    expect(screenSlugForPath('/(home)/birth-chart-view')).toBe('birth-chart');
  });
});

// ─── logScreenLoad ────────────────────────────────────────────────────────────

describe('logScreenLoad', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls setDoc on the screen root doc', async () => {
    logScreenLoad('/(main)/chat', 1200, { userId: 'uid-1', isPro: false });
    await Promise.resolve(); // flush microtasks
    expect(setDoc).toHaveBeenCalledWith(
      'mock-doc',
      expect.objectContaining({ screen: 'Chat', screenPath: '/(main)/chat' }),
      { merge: true },
    );
  });

  it('calls addDoc with metricType screen_load and correct shape', async () => {
    logScreenLoad('/(main)/chat', 1200, { userId: 'uid-1', isPro: true });
    await Promise.resolve();
    const call = (addDoc as jest.Mock).mock.calls[0][1];
    expect(call).toEqual(
      expect.objectContaining({
        metricType: 'screen_load',
        durationMs: 1200,
        screen: 'Chat',
        screenPath: '/(main)/chat',
        userId: 'uid-1',
        isPro: true,
        environment: 'development',
        os: 'ios',
      }),
    );
    // Also verify that session context fields are present
    expect(call.sessionId).toBeDefined();
    expect(typeof call.appVersion).toBe('string');
    expect(call.timestamp).toBe('MOCK_SERVER_TS');
  });

  it('is fire-and-forget — does not throw on Firestore error', async () => {
    (addDoc as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    expect(() => logScreenLoad('/(main)/chat', 100)).not.toThrow();
    await Promise.resolve();
    // no unhandled rejection
  });
});

// ─── logOperation ─────────────────────────────────────────────────────────────

describe('logOperation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes metricType ai_call with operationName', async () => {
    logOperation('/(main)/chat', 'chat_send', 3400, { userId: 'uid-2', isPro: false });
    await Promise.resolve();
    expect(addDoc).toHaveBeenCalledWith(
      'mock-col',
      expect.objectContaining({
        metricType: 'ai_call',
        operationName: 'chat_send',
        durationMs: 3400,
        userId: 'uid-2',
      }),
    );
  });
});

// ─── logError ─────────────────────────────────────────────────────────────────

describe('logError', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes metricType error with errorMessage and no durationMs', async () => {
    logError('/(main)/chat', 'fetch failed', { userId: 'uid-3', isPro: false });
    await Promise.resolve();
    const call = (addDoc as jest.Mock).mock.calls[0][1];
    expect(call.metricType).toBe('error');
    expect(call.errorMessage).toBe('fetch failed');
    expect(call.durationMs).toBeUndefined();
  });
});
