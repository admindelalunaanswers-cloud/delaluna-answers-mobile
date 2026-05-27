import { renderHook, act } from '@testing-library/react-native';
import { useScreenPerfLog } from '@/src/hooks/use-screen-perf-log';
import * as perfLog from '@/src/services/perf-log.service';
import { useUser } from '@/src/context/user-context';
import { useRevenueCat } from '@/src/context/revenuecat-context';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/src/services/perf-log.service', () => ({
  logScreenLoad: jest.fn(),
  logOperation:  jest.fn(),
  logError:      jest.fn(),
}));

jest.mock('@/src/context/user-context', () => ({
  useUser: jest.fn(),
}));

jest.mock('@/src/context/revenuecat-context', () => ({
  useRevenueCat: jest.fn(),
}));

const mockUseUser       = useUser as jest.Mock;
const mockUseRevenueCat = useRevenueCat as jest.Mock;

function setupMocks(uid = 'uid-test', isPro = false) {
  mockUseUser.mockReturnValue({ authUser: { uid } });
  mockUseRevenueCat.mockReturnValue({ isPro });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useScreenPerfLog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    setupMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('markReady', () => {
    it('calls logScreenLoad with the screen path and elapsed ms', () => {
      const { result } = renderHook(() => useScreenPerfLog('/(main)/chat'));

      // Advance time by 500ms after mount
      act(() => {
        jest.advanceTimersByTime(500);
        result.current.markReady();
      });

      expect(perfLog.logScreenLoad).toHaveBeenCalledTimes(1);
      const [path, duration, opts] = (perfLog.logScreenLoad as jest.Mock).mock.calls[0];
      expect(path).toBe('/(main)/chat');
      expect(duration).toBeGreaterThanOrEqual(500);
      expect(duration).toBeLessThan(600);
      expect(opts).toEqual({ userId: 'uid-test', isPro: false });
    });

    it('fires only once even when called multiple times (idempotent)', () => {
      const { result } = renderHook(() => useScreenPerfLog('/(main)/chat'));

      act(() => {
        result.current.markReady();
        result.current.markReady();
        result.current.markReady();
      });

      expect(perfLog.logScreenLoad).toHaveBeenCalledTimes(1);
    });

    it('passes isPro = true when user is premium', () => {
      setupMocks('uid-pro', true);
      const { result } = renderHook(() => useScreenPerfLog('/(main)/chat'));

      act(() => { result.current.markReady(); });

      expect(perfLog.logScreenLoad).toHaveBeenCalledWith(
        '/(main)/chat',
        expect.any(Number),
        { userId: 'uid-pro', isPro: true },
      );
    });

    it('passes userId = undefined when authUser is null', () => {
      mockUseUser.mockReturnValue({ authUser: null });
      mockUseRevenueCat.mockReturnValue({ isPro: false });

      const { result } = renderHook(() => useScreenPerfLog('/(main)/chat'));
      act(() => { result.current.markReady(); });

      expect(perfLog.logScreenLoad).toHaveBeenCalledWith(
        '/(main)/chat',
        expect.any(Number),
        { userId: undefined, isPro: false },
      );
    });
  });

  describe('logOp', () => {
    it('calls logOperation with correct args', () => {
      const { result } = renderHook(() => useScreenPerfLog('/(main)/chat'));

      act(() => { result.current.logOp('chat_send', 2400); });

      expect(perfLog.logOperation).toHaveBeenCalledWith(
        '/(main)/chat',
        'chat_send',
        2400,
        { userId: 'uid-test', isPro: false },
      );
    });
  });

  describe('logError', () => {
    it('calls logError with correct args', () => {
      const { result } = renderHook(() => useScreenPerfLog('/(main)/chat'));

      act(() => { result.current.logError('network timeout'); });

      expect(perfLog.logError).toHaveBeenCalledWith(
        '/(main)/chat',
        'network timeout',
        { userId: 'uid-test', isPro: false },
      );
    });
  });

  describe('stable callbacks', () => {
    it('markReady reference does not change across re-renders', () => {
      const { result, rerender } = renderHook(() => useScreenPerfLog('/(main)/chat'));
      const first = result.current.markReady;
      rerender({});
      expect(result.current.markReady).toBe(first);
    });

    it('logOp reference does not change across re-renders', () => {
      const { result, rerender } = renderHook(() => useScreenPerfLog('/(main)/chat'));
      const first = result.current.logOp;
      rerender({});
      expect(result.current.logOp).toBe(first);
    });

    it('logError reference does not change across re-renders', () => {
      const { result, rerender } = renderHook(() => useScreenPerfLog('/(main)/chat'));
      const first = result.current.logError;
      rerender({});
      expect(result.current.logError).toBe(first);
    });
  });
});
