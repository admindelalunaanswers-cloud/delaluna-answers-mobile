import { logEvent as fbLogEvent } from '@react-native-firebase/analytics';

import {
  relativeDay,
  routeKeyForSegments,
  screenLabelForPath,
  toAnalyticsValue,
  trackInteraction,
} from '@/src/services/analytics.service';

const logged = () => (fbLogEvent as jest.Mock).mock.calls.map(([, name, params]) => ({ name, params }));

describe('analytics.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('screen labels', () => {
    // usePathname() drops the groups and carries the concrete id, so keying on
    // it matched almost nothing and split each connection into its own screen.
    it('labels a dynamic route once, whatever the id', () => {
      const key = routeKeyForSegments(['connection', '[id]']);
      expect(key).toBe('/connection/[id]');
      expect(screenLabelForPath(key)).toBe('Connection Report');
    });

    it('keeps group segments, so the tab routes match their labels', () => {
      expect(screenLabelForPath(routeKeyForSegments(['(main)']))).toBe('Home');
      expect(screenLabelForPath(routeKeyForSegments(['(main)', 'transits']))).toBe('Transits');
      expect(screenLabelForPath(routeKeyForSegments(['(home)', 'birth-chart-view']))).toBe('Birth Chart');
    });

    it('prettifies a route it has no label for', () => {
      expect(screenLabelForPath('/(settings)/something-new')).toBe('Something New');
    });
  });

  describe('toAnalyticsValue', () => {
    it('snake_cases what the UI shows', () => {
      expect(toAnalyticsValue('Natal Wheel')).toBe('natal_wheel');
      expect(toAnalyticsValue('  Aspects ')).toBe('aspects');
      expect(toAnalyticsValue(7)).toBe('7');
    });

    it('stays within GA4’s 100-character value cap', () => {
      expect(toAnalyticsValue('x'.repeat(150))).toHaveLength(100);
    });
  });

  describe('relativeDay', () => {
    it.each([
      ['2026-10-20', 'yesterday'],
      ['2026-10-21', 'today'],
      ['2026-10-22', 'tomorrow'],
      ['2026-10-25', 'other'],
    ])('%s is %s', (dateId, expected) => {
      expect(relativeDay(dateId, '2026-10-21')).toBe(expected);
    });

    it('crosses a month boundary', () => {
      expect(relativeDay('2026-11-01', '2026-10-31')).toBe('tomorrow');
    });
  });

  describe('trackInteraction', () => {
    it('logs one ui_interaction event with normalised values', async () => {
      await trackInteraction({ screen: 'birth_chart', feature: 'Breakdown Tab', action: 'select', item: 'Aspects' });

      expect(logged()).toEqual([
        {
          name: 'ui_interaction',
          params: { screen: 'birth_chart', feature: 'breakdown_tab', action: 'select', item: 'aspects' },
        },
      ]);
    });

    // An empty `item` dimension is noise in every breakdown — leave it unset.
    it('omits item when there is none', async () => {
      await trackInteraction({ screen: 'home', feature: 'view_chart', action: 'tap' });
      await trackInteraction({ screen: 'home', feature: 'view_chart', action: 'tap', item: '' });

      for (const { params } of logged()) expect(params).not.toHaveProperty('item');
    });

    it('never throws when the SDK rejects', async () => {
      (fbLogEvent as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(
        trackInteraction({ screen: 'transits', feature: 'house_card', action: 'expand' }),
      ).resolves.toBeUndefined();
      warn.mockRestore();
    });
  });
});
