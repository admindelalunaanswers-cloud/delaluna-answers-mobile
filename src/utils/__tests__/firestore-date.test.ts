import { toDate } from '@/src/utils/firestore-date';

describe('firestore-date.ts utilities', () => {
  describe('toDate', () => {
    it('should return null for null input', () => {
      expect(toDate(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(toDate(undefined)).toBeNull();
    });

    it('should return the same Date if input is already a Date', () => {
      const date = new Date('2023-06-15');
      expect(toDate(date)).toBe(date);
    });

    it('should call toDate() method if available', () => {
      const mockFirestoreDate = {
        toDate: jest.fn(() => new Date('2023-06-15')),
      };

      const result = toDate(mockFirestoreDate);

      expect(mockFirestoreDate.toDate).toHaveBeenCalled();
      expect(result).toEqual(new Date('2023-06-15'));
    });

    it('should handle Firestore Timestamp format with seconds and nanoseconds', () => {
      const firestoreTimestamp = {
        seconds: 1686787200, // 2023-06-15 12:00:00 UTC
        nanoseconds: 500000000, // 0.5 seconds
      };

      const result = toDate(firestoreTimestamp);

      expect(result).toBeDefined();
      expect(result).toBeInstanceOf(Date);
      // Check that it includes the nanoseconds
      expect(result!.getTime()).toBe(1686787200000 + 500);
    });

    it('should handle Firestore Timestamp without nanoseconds', () => {
      const firestoreTimestamp = {
        seconds: 1686787200,
      };

      const result = toDate(firestoreTimestamp);

      expect(result).toBeDefined();
      expect(result).toBeInstanceOf(Date);
      expect(result!.getTime()).toBe(1686787200000);
    });

    it('should convert ISO string to Date', () => {
      const isoString = '2023-06-15T12:00:00Z';

      const result = toDate(isoString);

      expect(result).toBeDefined();
      expect(result).toBeInstanceOf(Date);
      expect(result!.toISOString()).toContain('2023-06-15');
    });

    it('should convert numeric timestamp (ms) to Date', () => {
      const timestamp = 1686787200000; // 2023-06-15 12:00:00 UTC

      const result = toDate(timestamp);

      expect(result).toBeDefined();
      expect(result).toBeInstanceOf(Date);
      expect(result!.getTime()).toBe(timestamp);
    });

    it('should return null for invalid string', () => {
      const result = toDate('not a date');

      expect(result).toBeNull();
    });

    it('should return null for invalid number', () => {
      const result = toDate(NaN);

      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = toDate('');

      expect(result).toBeNull();
    });

    it('should return null for zero', () => {
      // Zero is falsy but still a valid case
      expect(toDate(0)).toBeNull();
    });

    it('should return null for false', () => {
      expect(toDate(false)).toBeNull();
    });

    it('should return null for empty object with no toDate method', () => {
      const result = toDate({});

      expect(result).toBeNull();
    });

    it('should prefer toDate() method over seconds property', () => {
      const mockDate = new Date('2023-06-15');
      const mixedInput = {
        toDate: jest.fn(() => mockDate),
        seconds: 1000,
      };

      const result = toDate(mixedInput);

      expect(result).toBe(mockDate);
      expect(mixedInput.toDate).toHaveBeenCalled();
    });

    it('should handle date strings with timezone', () => {
      const dateString = '2023-06-15T12:00:00+00:00';

      const result = toDate(dateString);

      expect(result).toBeDefined();
      expect(result).toBeInstanceOf(Date);
    });

    it('should work with Firestore Timestamp with large nanoseconds', () => {
      const firestoreTimestamp = {
        seconds: 1686787200,
        nanoseconds: 999999999, // Almost 1 second
      };

      const result = toDate(firestoreTimestamp);

      expect(result).toBeDefined();
      expect(result!.getTime()).toBeCloseTo(1686787200000 + 999.999999, 2);
    });

    it('should handle common date formats', () => {
      const formats = [
        '2023-06-15',
        '2023/06/15',
        '06/15/2023',
        'June 15, 2023',
      ];

      formats.forEach(format => {
        const result = toDate(format);
        expect(result).toBeInstanceOf(Date);
      });
    });

    it('should return Date with correct UTC time', () => {
      const seconds = 0; // Jan 1, 1970 00:00:00 UTC
      const result = toDate({ seconds });

      expect(result!.getUTCFullYear()).toBe(1970);
      expect(result!.getUTCMonth()).toBe(0);
      expect(result!.getUTCDate()).toBe(1);
    });
  });
});
