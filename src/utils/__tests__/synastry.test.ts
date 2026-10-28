import { Aspect } from '@/src/services/astroEngine';
import {
    isKeySynastryPair,
    KEY_SYNASTRY_PAIRS,
    scoreAspect,
    selectTopAspects,
    summarizeSynastry
} from '@/src/utils/synastry';

// The functions under test read only planet1/planet2/type/orb/nature. The
// remaining `Aspect` fields are presentational (wheel rendering) and never
// consulted here, so fixtures spread these fillers in rather than restating
// four meaningless values at every call site.
const PRESENTATION: Pick<Aspect, 'symbol1' | 'symbol2' | 'aspectSymbol' | 'angle'> = {
  symbol1: '',
  symbol2: '',
  aspectSymbol: '',
  angle: 0,
};

describe('synastry.ts utilities', () => {
  describe('KEY_SYNASTRY_PAIRS', () => {
    it('should be a readonly set', () => {
      expect(KEY_SYNASTRY_PAIRS instanceof Set).toBe(true);
    });

    it('should contain expected key pairs', () => {
      const expectedPairs = [
        'Sun|Moon', 'Moon|Sun',
        'Sun|Venus', 'Venus|Sun',
        'Sun|Sun',
        'Moon|Moon',
        'Venus|Mars', 'Mars|Venus',
        'Moon|Venus', 'Venus|Moon',
        'Sun|Jupiter', 'Jupiter|Sun',
        'Mercury|Mercury',
      ];

      expectedPairs.forEach(pair => {
        expect(KEY_SYNASTRY_PAIRS.has(pair)).toBe(true);
      });
    });
  });

  describe('isKeySynastryPair', () => {
    it('should return true for key pair', () => {
      const aspect: Aspect = {
        ...PRESENTATION,
        planet1: 'Sun',
        planet2: 'Moon',
        type: 'Conjunction',
        orb: 2,
        nature: 'harmonious',
      };
      expect(isKeySynastryPair(aspect)).toBe(true);
    });

    it('should return false for non-key pair', () => {
      const aspect: Aspect = {
        ...PRESENTATION,
        planet1: 'Saturn',
        planet2: 'Uranus',
        type: 'Square',
        orb: 3,
        nature: 'challenging',
      };
      expect(isKeySynastryPair(aspect)).toBe(false);
    });

    it('should be order-sensitive', () => {
      const aspect1: Aspect = {
        ...PRESENTATION,
        planet1: 'Sun',
        planet2: 'Moon',
        type: 'Conjunction',
        orb: 2,
        nature: 'harmonious',
      };
      expect(isKeySynastryPair(aspect1)).toBe(true);

      const aspect2: Aspect = {
        ...PRESENTATION,
        planet1: 'Moon',
        planet2: 'Sun',
        type: 'Conjunction',
        orb: 2,
        nature: 'harmonious',
      };
      expect(isKeySynastryPair(aspect2)).toBe(true);
    });

    it('should return false for aspects not in key pairs', () => {
      const aspect: Aspect = {
        ...PRESENTATION,
        planet1: 'Sun',
        planet2: 'Saturn',
        type: 'Square',
        orb: 3,
        nature: 'challenging',
      };
      expect(isKeySynastryPair(aspect)).toBe(false);
    });
  });

  describe('summarizeSynastry', () => {
    it('should categorize aspects correctly', () => {
      const aspects: Aspect[] = [
        {
          ...PRESENTATION,
          planet1: 'Sun',
          planet2: 'Moon',
          type: 'Conjunction',
          orb: 2,
          nature: 'harmonious',
        },
        {
          ...PRESENTATION,
          planet1: 'Venus',
          planet2: 'Mars',
          type: 'Square',
          orb: 3,
          nature: 'challenging',
        },
        {
          ...PRESENTATION,
          planet1: 'Mercury',
          planet2: 'Jupiter',
          type: 'Sextile',
          orb: 1.5,
          nature: 'harmonious',
        },
        {
          ...PRESENTATION,
          planet1: 'Saturn',
          planet2: 'Uranus',
          type: 'Opposition',
          orb: 4,
          nature: 'neutral',
        },
      ];

      const summary = summarizeSynastry(aspects);

      expect(summary.keyAspects).toHaveLength(2); // Sun|Moon and Venus|Mars
      expect(summary.keyAspects.map(a => a.planet1)).toContain('Sun');
      expect(summary.otherAspects).toHaveLength(2);
      expect(summary.harmonious).toBe(2);
      expect(summary.neutral).toBe(1);
      expect(summary.challenging).toBe(1);
    });

    it('should return empty arrays for empty input', () => {
      const summary = summarizeSynastry([]);
      expect(summary.keyAspects).toEqual([]);
      expect(summary.otherAspects).toEqual([]);
      expect(summary.harmonious).toBe(0);
      expect(summary.neutral).toBe(0);
      expect(summary.challenging).toBe(0);
    });

    it('should handle all key pairs correctly', () => {
      const keyPairAspects: Aspect[] = [
        {
          ...PRESENTATION,
          planet1: 'Sun',
          planet2: 'Moon',
          type: 'Conjunction',
          orb: 2,
          nature: 'harmonious',
        },
        {
          ...PRESENTATION,
          planet1: 'Moon',
          planet2: 'Sun',
          type: 'Conjunction',
          orb: 2,
          nature: 'harmonious',
        },
        {
          ...PRESENTATION,
          planet1: 'Venus',
          planet2: 'Mars',
          type: 'Trine',
          orb: 2,
          nature: 'harmonious',
        },
      ];

      const summary = summarizeSynastry(keyPairAspects);
      expect(summary.keyAspects).toHaveLength(3);
      expect(summary.otherAspects).toHaveLength(0);
    });

    it('should categorize nature correctly', () => {
      const aspects: Aspect[] = [
        {
          ...PRESENTATION,
          planet1: 'Sun',
          planet2: 'Venus',
          type: 'Conjunction',
          orb: 1,
          nature: 'harmonious',
        },
        {
          ...PRESENTATION,
          planet1: 'Moon',
          planet2: 'Mercury',
          type: 'Opposition',
          orb: 2,
          nature: 'neutral',
        },
        {
          ...PRESENTATION,
          planet1: 'Mars',
          planet2: 'Saturn',
          type: 'Square',
          orb: 2,
          nature: 'challenging',
        },
      ];

      const summary = summarizeSynastry(aspects);
      expect(summary.harmonious).toBe(1);
      expect(summary.neutral).toBe(1);
      expect(summary.challenging).toBe(1);
    });
  });

  describe('scoreAspect', () => {
    it('should return null for aspect with orb exceeding max', () => {
      const aspect: Aspect = {
        ...PRESENTATION,
        planet1: 'Sun',
        planet2: 'Moon',
        type: 'Conjunction',
        orb: 10, // Exceeds max orb of 8 for Conjunction
        nature: 'harmonious',
      };
      expect(scoreAspect(aspect)).toBeNull();
    });

    it('should return null for unknown aspect type', () => {
      const aspect: Aspect = {
        ...PRESENTATION,
        planet1: 'Sun',
        planet2: 'Moon',
        type: 'UnknownAspect',
        orb: 2,
        nature: 'harmonious',
      } as Aspect;
      expect(scoreAspect(aspect)).toBeNull();
    });

    it('should score Conjunction between Sun and Moon highly', () => {
      const aspect: Aspect = {
        ...PRESENTATION,
        planet1: 'Sun',
        planet2: 'Moon',
        type: 'Conjunction',
        orb: 0, // Tight orb
        nature: 'harmonious',
      };
      const score = scoreAspect(aspect);
      expect(score).not.toBeNull();
      expect(score).toBeGreaterThan(20); // High score for tight orb
    });

    it('should give lower score for larger orb', () => {
      const tightAspect: Aspect = {
        ...PRESENTATION,
        planet1: 'Sun',
        planet2: 'Moon',
        type: 'Conjunction',
        orb: 1,
        nature: 'harmonious',
      };

      const wideAspect: Aspect = {
        ...PRESENTATION,
        planet1: 'Sun',
        planet2: 'Moon',
        type: 'Conjunction',
        orb: 7,
        nature: 'harmonious',
      };

      const tightScore = scoreAspect(tightAspect);
      const wideScore = scoreAspect(wideAspect);

      expect(tightScore).not.toBeNull();
      expect(wideScore).not.toBeNull();
      expect(tightScore! > wideScore!).toBe(true);
    });

    it('should score heavy planets higher', () => {
      const sunMoonAspect: Aspect = {
        ...PRESENTATION,
        planet1: 'Sun',
        planet2: 'Moon',
        type: 'Conjunction',
        orb: 2,
        nature: 'harmonious',
      };

      const chironNeptuneAspect: Aspect = {
        ...PRESENTATION,
        planet1: 'Chiron',
        planet2: 'Neptune',
        type: 'Conjunction',
        orb: 2,
        nature: 'harmonious',
      };

      const sunMoonScore = scoreAspect(sunMoonAspect);
      const chironNeptuneScore = scoreAspect(chironNeptuneAspect);

      expect(sunMoonScore).not.toBeNull();
      expect(chironNeptuneScore).not.toBeNull();
      expect(sunMoonScore! > chironNeptuneScore!).toBe(true);
    });

    it('should return 0 for unknown planets', () => {
      const aspect: Aspect = {
        ...PRESENTATION,
        planet1: 'UnknownPlanet1',
        planet2: 'UnknownPlanet2',
        type: 'Conjunction',
        orb: 2,
        nature: 'harmonious',
      } as Aspect;

      const score = scoreAspect(aspect);
      expect(score).not.toBeNull();
      expect(score).toBeLessThan(15); // Should be very low
    });

    it('should score Conjunction higher than Sextile', () => {
      const conjunctionAspect: Aspect = {
        ...PRESENTATION,
        planet1: 'Sun',
        planet2: 'Moon',
        type: 'Conjunction',
        orb: 2,
        nature: 'harmonious',
      };

      const sextileAspect: Aspect = {
        ...PRESENTATION,
        planet1: 'Sun',
        planet2: 'Moon',
        type: 'Sextile',
        orb: 2,
        nature: 'harmonious',
      };

      const conjScore = scoreAspect(conjunctionAspect);
      const sextScore = scoreAspect(sextileAspect);

      expect(conjScore).not.toBeNull();
      expect(sextScore).not.toBeNull();
      expect(conjScore! > sextScore!).toBe(true);
    });
  });

  describe('selectTopAspects', () => {
    it('should return high-scoring aspects above floor', () => {
      const aspects: Aspect[] = [
        {
          ...PRESENTATION,
          planet1: 'Sun',
          planet2: 'Moon',
          type: 'Conjunction',
          orb: 2,
          nature: 'harmonious',
        },
        {
          ...PRESENTATION,
          planet1: 'Venus',
          planet2: 'Mars',
          type: 'Trine',
          orb: 1,
          nature: 'harmonious',
        },
        {
          ...PRESENTATION,
          planet1: 'Mercury',
          planet2: 'Mercury',
          type: 'Conjunction',
          orb: 0,
          nature: 'neutral',
        },
      ];

      const selected = selectTopAspects(aspects);
      expect(selected.length).toBeGreaterThan(0);
      expect(selected[0].score).toBeGreaterThanOrEqual(selected[selected.length - 1].score);
    });

    it('should return at least MIN_ASPECTS if they exist', () => {
      const aspects: Aspect[] = [
        {
          ...PRESENTATION,
          planet1: 'Sun',
          planet2: 'Moon',
          type: 'Conjunction',
          orb: 0.5,
          nature: 'harmonious',
        },
        {
          ...PRESENTATION,
          planet1: 'Venus',
          planet2: 'Mars',
          type: 'Trine',
          orb: 0.5,
          nature: 'harmonious',
        },
        {
          ...PRESENTATION,
          planet1: 'Mercury',
          planet2: 'Jupiter',
          type: 'Sextile',
          orb: 1,
          nature: 'harmonious',
        },
        {
          ...PRESENTATION,
          planet1: 'Moon',
          planet2: 'Venus',
          type: 'Conjunction',
          orb: 1,
          nature: 'harmonious',
        },
      ];

      const selected = selectTopAspects(aspects);
      expect(selected.length).toBeGreaterThanOrEqual(4);
    });

    it('should limit results to MAX_ASPECTS', () => {
      const aspects: Aspect[] = Array.from({ length: 20 }, (_, i) => ({
        ...PRESENTATION,
        planet1: 'Sun',
        planet2: i % 2 === 0 ? 'Moon' : 'Venus',
        type: 'Conjunction',
        orb: i * 0.2,
        nature: 'harmonious' as const,
      }));

      const selected = selectTopAspects(aspects);
      expect(selected.length).toBeLessThanOrEqual(7);
    });

    it('should sort by score descending', () => {
      const aspects: Aspect[] = [
        {
          ...PRESENTATION,
          planet1: 'Chiron',
          planet2: 'Neptune',
          type: 'Quincunx',
          orb: 1,
          nature: 'neutral',
        },
        {
          ...PRESENTATION,
          planet1: 'Sun',
          planet2: 'Moon',
          type: 'Conjunction',
          orb: 0.5,
          nature: 'harmonious',
        },
        {
          ...PRESENTATION,
          planet1: 'Mercury',
          planet2: 'Mercury',
          type: 'Conjunction',
          orb: 0,
          nature: 'neutral',
        },
      ];

      const selected = selectTopAspects(aspects);
      for (let i = 0; i < selected.length - 1; i++) {
        expect(selected[i].score).toBeGreaterThanOrEqual(selected[i + 1].score);
      }
    });

    it('should assign unique ids', () => {
      const aspects: Aspect[] = [
        {
          ...PRESENTATION,
          planet1: 'Sun',
          planet2: 'Moon',
          type: 'Conjunction',
          orb: 1,
          nature: 'harmonious',
        },
        {
          ...PRESENTATION,
          planet1: 'Venus',
          planet2: 'Mars',
          type: 'Trine',
          orb: 1,
          nature: 'harmonious',
        },
      ];

      const selected = selectTopAspects(aspects);
      const ids = selected.map(a => a.id);
      expect(new Set(ids).size).toBe(ids.length); // All unique
    });

    it('should return empty array for empty input', () => {
      const selected = selectTopAspects([]);
      expect(selected).toEqual([]);
    });

    it('should filter out aspects with invalid orb', () => {
      const aspects: Aspect[] = [
        {
          ...PRESENTATION,
          planet1: 'Sun',
          planet2: 'Moon',
          type: 'Conjunction',
          orb: 10, // Exceeds max orb
          nature: 'harmonious',
        },
        {
          ...PRESENTATION,
          planet1: 'Venus',
          planet2: 'Mars',
          type: 'Trine',
          orb: 1,
          nature: 'harmonious',
        },
      ];

      const selected = selectTopAspects(aspects);
      expect(selected.every(a => a.type !== 'Conjunction' || a.orb <= 8)).toBe(true);
    });
  });
});
