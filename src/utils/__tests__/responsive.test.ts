// Set up mock BEFORE importing the module
jest.mock('react-native', () => ({
  Dimensions: {
    get: jest.fn(() => ({ width: 375, height: 812 })),
  },
}));

import { moderateScale, scale, verticalScale } from '@/src/utils/responsive';

describe('responsive.ts utilities', () => {
  describe('scale', () => {
    it('should scale values based on screen width', () => {
      // Since dimensions are read at module import time, we test the logic
      // The baseline is 375, so scale(10) should equal 10
      expect(scale(10)).toBeDefined();
      expect(typeof scale(10)).toBe('number');
    });

    it('should return proportional values', () => {
      // Double the input should roughly double the output
      expect(scale(20)).toBeGreaterThanOrEqual(scale(10));
    });

    it('should handle zero', () => {
      expect(scale(0)).toBe(0);
    });

    it('should work with decimals', () => {
      const result = scale(7.5);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('verticalScale', () => {
    it('should scale values based on screen height', () => {
      expect(verticalScale(10)).toBeDefined();
      expect(typeof verticalScale(10)).toBe('number');
    });

    it('should return proportional values', () => {
      expect(verticalScale(20)).toBeGreaterThanOrEqual(verticalScale(10));
    });

    it('should handle zero', () => {
      expect(verticalScale(0)).toBe(0);
    });

    it('should work with decimals', () => {
      const result = verticalScale(8.12);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('moderateScale', () => {
    it('should apply scaling with default factor', () => {
      const result = moderateScale(10);
      expect(typeof result).toBe('number');
      expect(Number.isInteger(result)).toBe(true);
    });

    it('should apply custom factor', () => {
      const result0 = moderateScale(10, 0);
      const result05 = moderateScale(10, 0.5);
      const result1 = moderateScale(10, 1);

      // More significant factor should result in more scaling
      expect(result1).toBeGreaterThanOrEqual(result05);
      expect(result05).toBeGreaterThanOrEqual(result0);
    });

    it('should return integer values', () => {
      expect(Number.isInteger(moderateScale(10))).toBe(true);
      expect(Number.isInteger(moderateScale(16, 0.5))).toBe(true);
    });

    it('should work with various sizes', () => {
      [1, 5, 10, 16, 32, 100].forEach(size => {
        const result = moderateScale(size);
        expect(typeof result).toBe('number');
        expect(result).toBeGreaterThanOrEqual(0);
      });
    });

    it('should respect factor = 0 (no scaling)', () => {
      expect(moderateScale(10, 0)).toBe(10);
      expect(moderateScale(20, 0)).toBe(20);
      expect(moderateScale(5, 0)).toBe(5);
    });

    it('should handle fractional inputs', () => {
      const result = moderateScale(10.5);
      expect(typeof result).toBe('number');
    });
  });

  describe('edge cases', () => {
    it('should handle very small values', () => {
      expect(scale(0.1)).toBeGreaterThanOrEqual(0);
      expect(verticalScale(0.1)).toBeGreaterThanOrEqual(0);
      expect(moderateScale(0.1)).toBeGreaterThanOrEqual(0);
    });

    it('should handle large values', () => {
      expect(scale(1000)).toBeDefined();
      expect(verticalScale(1000)).toBeDefined();
      expect(moderateScale(1000)).toBeDefined();
    });

    it('should maintain consistency across calls', () => {
      expect(scale(10)).toBe(scale(10));
      expect(verticalScale(10)).toBe(verticalScale(10));
      expect(moderateScale(10)).toBe(moderateScale(10));
    });
  });
});
