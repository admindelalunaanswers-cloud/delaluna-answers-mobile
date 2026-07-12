import {
    appendToTarotHistory,
    clearTarotCache,
    getDailyCardFromCache,
    saveDailyCardToCache,
    tarotDailyKey,
    tarotHistoryKey,
} from '@/src/services/tarotCache.service';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
  multiRemove: jest.fn(),
}));

// Mock the DailyTarotSchema to avoid validation issues in tests
jest.mock('@/src/schemas/dailyTarot.schema', () => ({
  DailyTarotSchema: {
    safeParse: jest.fn((data) => ({
      success: data && 'cardName' in data,
      data,
    })),
  },
}));

describe('tarotCache.service.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.warn = jest.fn();
  });

  const mockUserId = 'test-user-123';
  const mockTarotCard = {
    cardName: 'The Fool',
    position: 'upright',
    date: new Date().toISOString(),
    message: 'Test message',
  };

  describe('tarotDailyKey', () => {
    it('should generate correct key format', () => {
      const key = tarotDailyKey('user-id');
      expect(key).toBe('tarot_daily_user-id');
    });

    it('should include userId in key', () => {
      const key = tarotDailyKey('123');
      expect(key).toContain('123');
    });

    it('should return different keys for different users', () => {
      const key1 = tarotDailyKey('user1');
      const key2 = tarotDailyKey('user2');
      expect(key1).not.toBe(key2);
    });
  });

  describe('tarotHistoryKey', () => {
    it('should generate correct key format', () => {
      const key = tarotHistoryKey('user-id');
      expect(key).toBe('tarot_history_user-id');
    });

    it('should include userId in key', () => {
      const key = tarotHistoryKey('456');
      expect(key).toContain('456');
    });

    it('should return different keys for different users', () => {
      const key1 = tarotHistoryKey('user1');
      const key2 = tarotHistoryKey('user2');
      expect(key1).not.toBe(key2);
    });

    it('should return different keys for daily vs history', () => {
      const userId = 'same-user';
      const dailyKey = tarotDailyKey(userId);
      const historyKey = tarotHistoryKey(userId);
      expect(dailyKey).not.toBe(historyKey);
    });
  });

  describe('clearTarotCache', () => {
    it('should remove both daily and history keys', async () => {
      (AsyncStorage.multiRemove as jest.Mock).mockResolvedValue(undefined);

      await clearTarotCache(mockUserId);

      expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
        tarotDailyKey(mockUserId),
        tarotHistoryKey(mockUserId),
      ]);
    });

    it('should handle errors silently', async () => {
      const error = new Error('Storage error');
      (AsyncStorage.multiRemove as jest.Mock).mockRejectedValue(error);

      // Should not throw
      await expect(clearTarotCache(mockUserId)).resolves.not.toThrow();
      expect(console.warn).toHaveBeenCalled();
    });

    it('should warn on error', async () => {
      const error = new Error('Storage failed');
      (AsyncStorage.multiRemove as jest.Mock).mockRejectedValue(error);

      await clearTarotCache(mockUserId);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clear tarot cache'),
        error
      );
    });
  });

  describe('saveDailyCardToCache', () => {
    it('should save card as JSON string', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await saveDailyCardToCache(mockUserId, mockTarotCard as any);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        tarotDailyKey(mockUserId),
        JSON.stringify(mockTarotCard)
      );
    });

    it('should use correct cache key', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await saveDailyCardToCache(mockUserId, mockTarotCard as any);

      const [key] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      expect(key).toBe(tarotDailyKey(mockUserId));
    });

    it('should handle save errors silently', async () => {
      const error = new Error('Save failed');
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(error);

      await expect(saveDailyCardToCache(mockUserId, mockTarotCard as any)).resolves.not.toThrow();
      expect(console.warn).toHaveBeenCalled();
    });

    it('should warn on save error', async () => {
      const error = new Error('Storage error');
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(error);

      await saveDailyCardToCache(mockUserId, mockTarotCard as any);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save daily tarot card'),
        error
      );
    });
  });

  describe('getDailyCardFromCache', () => {
    it('should return null when cache is empty', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await getDailyCardFromCache(mockUserId);

      expect(result).toBeNull();
    });

    it('should parse and return cached card', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockTarotCard));

      const result = await getDailyCardFromCache(mockUserId);

      expect(result).toEqual(expect.objectContaining({
        cardName: 'The Fool',
        position: 'upright',
      }));
    });

    it('should remove invalid cached data', async () => {
      const invalidData = JSON.stringify({ invalid: 'data' });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(invalidData);
      (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

      const result = await getDailyCardFromCache(mockUserId);

      expect(result).toBeNull();
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(tarotDailyKey(mockUserId));
    });

    it('should warn when cache is invalid', async () => {
      const invalidData = JSON.stringify({ notValid: true });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(invalidData);
      (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

      await getDailyCardFromCache(mockUserId);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cached tarot card was invalid')
      );
    });

    it('should handle read errors silently', async () => {
      const error = new Error('Read failed');
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(error);

      const result = await getDailyCardFromCache(mockUserId);

      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalled();
    });

    it('should handle JSON parse errors', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('invalid json {');

      const result = await getDailyCardFromCache(mockUserId);

      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalled();
    });

    it('should use correct cache key', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await getDailyCardFromCache(mockUserId);

      expect(AsyncStorage.getItem).toHaveBeenCalledWith(tarotDailyKey(mockUserId));
    });
  });

  describe('appendToTarotHistory', () => {
    it('should create new history with single entry', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await appendToTarotHistory(mockUserId, mockTarotCard as any);

      const [_, data] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const parsed = JSON.parse(data);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual(mockTarotCard);
    });

    it('should prepend new entries to existing history', async () => {
      const oldEntry = { cardName: 'The Magician', position: 'reversed' };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([oldEntry]));
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await appendToTarotHistory(mockUserId, mockTarotCard as any);

      const [_, data] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const parsed = JSON.parse(data);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual(mockTarotCard);
      expect(parsed[1]).toEqual(oldEntry);
    });

    it('should handle invalid history data', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ invalid: true }));
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await appendToTarotHistory(mockUserId, mockTarotCard as any);

      const [_, data] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const parsed = JSON.parse(data);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual(mockTarotCard);
    });

    it('should handle JSON parse errors in existing history', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('invalid json {');
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await appendToTarotHistory(mockUserId, mockTarotCard as any);

      const [_, data] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const parsed = JSON.parse(data);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual(mockTarotCard);
    });

    it('should use correct cache key', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await appendToTarotHistory(mockUserId, mockTarotCard as any);

      const [key] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      expect(key).toBe(tarotHistoryKey(mockUserId));
    });

    it('should handle append errors silently', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const error = new Error('Append failed');
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(error);

      await expect(appendToTarotHistory(mockUserId, mockTarotCard as any)).resolves.not.toThrow();
      expect(console.warn).toHaveBeenCalled();
    });

    it('should maintain order with multiple appends', async () => {
      const card1 = { cardName: 'Card 1' };
      const card2 = { cardName: 'Card 2' };
      const card3 = { cardName: 'Card 3' };

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await appendToTarotHistory(mockUserId, card1 as any);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([card1]));

      await appendToTarotHistory(mockUserId, card2 as any);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([card2, card1]));

      await appendToTarotHistory(mockUserId, card3 as any);

      const [_, data] = (AsyncStorage.setItem as jest.Mock).mock.calls[2];
      const parsed = JSON.parse(data);
      expect(parsed).toEqual([card3, card2, card1]);
    });
  });
});
