import {
    detectTimezoneOffset,
    formatPlace,
    formatUtcOffset,
    getUtcOffsetHours,
    hasCity,
    NominatimResult,
    searchNominatim,
} from '@/src/utils/location';

// Mock fetch globally
global.fetch = jest.fn();

describe('location.ts utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hasCity', () => {
    it('should return true when city is present', () => {
      const result: NominatimResult = {
        place_id: 1,
        display_name: 'New York',
        lat: '40.7128',
        lon: '-74.0060',
        type: 'city',
        address: { city: 'New York', state: 'NY', country: 'United States' },
      };
      expect(hasCity(result)).toBe(true);
    });

    it('should return true when town is present', () => {
      const result: NominatimResult = {
        place_id: 1,
        display_name: 'Springfield',
        lat: '39.7817',
        lon: '-89.6501',
        type: 'town',
        address: { town: 'Springfield', state: 'IL', country: 'United States' },
      };
      expect(hasCity(result)).toBe(true);
    });

    it('should return true when village is present', () => {
      const result: NominatimResult = {
        place_id: 1,
        display_name: 'Test Village',
        lat: '50.0',
        lon: '20.0',
        type: 'village',
        address: { village: 'Test Village', country: 'Test Country' },
      };
      expect(hasCity(result)).toBe(true);
    });

    it('should return true when municipality is present', () => {
      const result: NominatimResult = {
        place_id: 1,
        display_name: 'Test Municipality',
        lat: '50.0',
        lon: '20.0',
        type: 'municipality',
        address: { municipality: 'Test Municipality', country: 'Test' },
      };
      expect(hasCity(result)).toBe(true);
    });

    it('should return false when no city-level place is present', () => {
      const result: NominatimResult = {
        place_id: 1,
        display_name: 'Some State',
        lat: '50.0',
        lon: '20.0',
        type: 'state',
        address: { state: 'Test State', country: 'Test Country' },
      };
      expect(hasCity(result)).toBe(false);
    });

    it('should return false for country-level results', () => {
      const result: NominatimResult = {
        place_id: 1,
        display_name: 'United States',
        lat: '37.0902',
        lon: '-95.7129',
        type: 'country',
        address: { country: 'United States' },
      };
      expect(hasCity(result)).toBe(false);
    });
  });

  describe('formatPlace', () => {
    it('should format place with city, state, and country', () => {
      const result: NominatimResult = {
        place_id: 1,
        display_name: 'New York, New York, United States',
        lat: '40.7128',
        lon: '-74.0060',
        type: 'city',
        address: { city: 'New York', state: 'NY', country: 'United States' },
      };
      expect(formatPlace(result)).toBe('New York, NY, United States');
    });

    it('should format place with town and country only (no state)', () => {
      const result: NominatimResult = {
        place_id: 1,
        display_name: 'Test Town, Country',
        lat: '50.0',
        lon: '20.0',
        type: 'town',
        address: { town: 'Test Town', country: 'Test Country' },
      };
      expect(formatPlace(result)).toBe('Test Town, Test Country');
    });

    it('should fallback to display_name if no structured address available', () => {
      const result: NominatimResult = {
        place_id: 1,
        display_name: 'Some Place',
        lat: '50.0',
        lon: '20.0',
        type: 'place',
        address: {},
      };
      expect(formatPlace(result)).toBe('Some Place');
    });

    it('should prefer city over town over village over municipality', () => {
      const result: NominatimResult = {
        place_id: 1,
        display_name: '',
        lat: '50.0',
        lon: '20.0',
        type: 'place',
        address: {
          city: 'City Name',
          town: 'Town Name',
          village: 'Village Name',
          country: 'Country',
        },
      };
      expect(formatPlace(result)).toBe('City Name, Country');
    });
  });

  describe('getUtcOffsetHours', () => {
    it('should return 0 for UTC timezone', () => {
      const date = new Date('2023-06-15T12:00:00Z');
      expect(getUtcOffsetHours('UTC', date)).toBe(0);
    });

    it('should return negative offset for west timezones', () => {
      const date = new Date('2023-06-15T12:00:00Z');
      const offset = getUtcOffsetHours('America/New_York', date);
      // EDT (Eastern Daylight Time) is UTC-4
      expect(offset).toBe(-4);
    });

    it('should return positive offset for east timezones', () => {
      const date = new Date('2023-06-15T12:00:00Z');
      const offset = getUtcOffsetHours('Asia/Tokyo', date);
      // JST (Japan Standard Time) is UTC+9
      expect(offset).toBe(9);
    });

    it('should handle quarter-hour offsets', () => {
      const date = new Date('2023-06-15T12:00:00Z');
      const offset = getUtcOffsetHours('Asia/Kolkata', date);
      // IST (Indian Standard Time) is UTC+5:30
      expect(offset).toBe(5.5);
    });

    it('should handle DST transitions', () => {
      // Summer date (DST active)
      const summerDate = new Date('2023-06-15T12:00:00Z');
      const summerOffset = getUtcOffsetHours('America/Chicago', summerDate);
      // CDT (Central Daylight Time) is UTC-5
      expect(summerOffset).toBe(-5);

      // Winter date (DST inactive)
      const winterDate = new Date('2023-12-15T12:00:00Z');
      const winterOffset = getUtcOffsetHours('America/Chicago', winterDate);
      // CST (Central Standard Time) is UTC-6
      expect(winterOffset).toBe(-6);
    });
  });

  describe('searchNominatim', () => {
    it('should return deduplicated city results', async () => {
      const mockData: NominatimResult[] = [
        {
          place_id: 1,
          display_name: 'New York, NY, USA',
          lat: '40.7128',
          lon: '-74.0060',
          type: 'city',
          address: { city: 'New York', state: 'NY', country: 'United States' },
        },
        {
          place_id: 2,
          display_name: 'New York, NY, USA (duplicate)',
          lat: '40.7128',
          lon: '-74.0060',
          type: 'city',
          address: { city: 'New York', state: 'NY', country: 'United States' },
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const results = await searchNominatim('New York');
      expect(results).toHaveLength(1);
      expect(results[0].place_id).toBe(1);
    });

    it('should filter out non-city results', async () => {
      const mockData: NominatimResult[] = [
        {
          place_id: 1,
          display_name: 'New York, NY, USA',
          lat: '40.7128',
          lon: '-74.0060',
          type: 'city',
          address: { city: 'New York', state: 'NY', country: 'United States' },
        },
        {
          place_id: 2,
          display_name: 'New York (state)',
          lat: '43.0',
          lon: '-75.0',
          type: 'state',
          address: { state: 'New York', country: 'United States' },
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const results = await searchNominatim('New York');
      expect(results).toHaveLength(1);
      expect(results[0].address.city).toBe('New York');
    });

    it('should throw error on failed request', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      await expect(searchNominatim('Invalid')).rejects.toThrow(
        'Nominatim request failed'
      );
    });

    it('should include proper headers in request', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await searchNominatim('test');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('nominatim.openstreetmap.org'),
        expect.objectContaining({
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'AstroNatal/1.0',
          },
        })
      );
    });

    it('should encode query properly', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await searchNominatim('São Paulo');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('São Paulo')),
        expect.any(Object)
      );
    });
  });

  describe('detectTimezoneOffset', () => {
    it('should return numeric UTC offset for valid coordinates', async () => {
      const birthDate = new Date('2023-06-15');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezone: 'America/New_York',
          utc_offset_seconds: -14400, // EDT
        }),
      });

      const offset = await detectTimezoneOffset(40.7128, -74.0060, birthDate);
      expect(offset).toBe(-4); // EDT is UTC-4
    });

    it('should return 0 (UTC) on failed request', async () => {
      const birthDate = new Date('2023-06-15');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const offset = await detectTimezoneOffset(40.7128, -74.0060, birthDate);
      expect(offset).toBe(0);
    });

    it('should return 0 (UTC) on network error', async () => {
      const birthDate = new Date('2023-06-15');

      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      const offset = await detectTimezoneOffset(40.7128, -74.0060, birthDate);
      expect(offset).toBe(0);
    });

    it('should fallback to utc_offset_seconds if timezone parsing fails', async () => {
      const birthDate = new Date('2023-06-15');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezone: undefined,
          utc_offset_seconds: -18000, // EST is UTC-5
        }),
      });

      const offset = await detectTimezoneOffset(40.7128, -74.0060, birthDate);
      // Rounds to nearest quarter hour
      expect(offset).toBe(-5);
    });

    it('should call API with correct coordinates', async () => {
      const birthDate = new Date('2023-06-15');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timezone: 'UTC',
          utc_offset_seconds: 0,
        }),
      });

      await detectTimezoneOffset(40.7128, -74.0060, birthDate);

      const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(callUrl).toContain('latitude=40.7128');
      expect(callUrl).toContain('longitude=-74.006');
    });
  });

  describe('formatUtcOffset', () => {
    it('should format positive integer offset', () => {
      expect(formatUtcOffset(5)).toBe('UTC+5');
    });

    it('should format negative integer offset', () => {
      expect(formatUtcOffset(-5)).toBe('UTC−5');
    });

    it('should format positive fractional offset', () => {
      expect(formatUtcOffset(5.5)).toBe('UTC+5:30');
    });

    it('should format negative fractional offset', () => {
      expect(formatUtcOffset(-3.5)).toBe('UTC−3:30');
    });

    it('should format zero offset', () => {
      expect(formatUtcOffset(0)).toBe('UTC+0');
    });

    it('should handle quarter-hour offsets', () => {
      expect(formatUtcOffset(5.75)).toBe('UTC+5:45');
    });

    it('should pad minutes with leading zero', () => {
      expect(formatUtcOffset(3.25)).toBe('UTC+3:15');
    });

    it('should use minus sign (−) not dash for negative', () => {
      const result = formatUtcOffset(-8);
      expect(result).toContain('−');
      expect(result).not.toContain('-');
    });
  });
});
