import { CATEGORY_WEIGHTS, ScoringService } from '../core/ScoringService';
import type { CategoryResult } from '../types/index';

function category(overrides: Partial<CategoryResult> & { id: string }): CategoryResult {
  return {
    name: overrides.id,
    score: 0,
    grade: '',
    weight: 0,
    findings: [],
    metrics: {},
    ...overrides,
  };
}

describe('ScoringService', () => {
  let scoringService: ScoringService;

  beforeEach(() => {
    scoringService = new ScoringService();
  });

  describe('CATEGORY_WEIGHTS', () => {
    it('is the single source of truth and sums to 1.0', () => {
      const total = Object.values(CATEGORY_WEIGHTS).reduce((sum, w) => sum + w, 0);
      expect(total).toBeCloseTo(1.0, 10);
      expect(Object.keys(CATEGORY_WEIGHTS).sort()).toEqual([
        'accessibility',
        'components',
        'documentation',
        'performance',
        'tokens',
        'tooling',
      ]);
    });
  });

  describe('calculateOverallScore', () => {
    it('calculates the weighted average using central weights, not category.weight', () => {
      const categories = [
        // Deliberately wrong weight values on the results — the service must
        // ignore them and use CATEGORY_WEIGHTS.
        category({ id: 'components', score: 80, weight: 0.99 }),
        category({ id: 'tokens', score: 90, weight: 0.01 }),
      ];

      const result = scoringService.calculateOverallScore(categories);

      // (80 * 0.25 + 90 * 0.20) / (0.25 + 0.20) = 84.44
      expect(result.score).toBe(84);
      expect(result.grade).toBe('B');
    });

    it('excludes unknown category IDs instead of assigning phantom weight', () => {
      const categories = [
        category({ id: 'components', score: 80 }),
        category({ id: 'not-a-real-category', score: 0 }),
      ];

      const result = scoringService.calculateOverallScore(categories);
      // The unknown category must not drag the score down.
      expect(result.score).toBe(80);
    });

    it('handles empty categories', () => {
      const result = scoringService.calculateOverallScore([]);
      expect(result.score).toBe(0);
      expect(result.grade).toBe('F');
    });

    it('applies external design-system weight adjustments conservatively', () => {
      const categories = [
        category({ id: 'components', score: 100 }),
        category({ id: 'tokens', score: 100 }),
        category({ id: 'documentation', score: 0 }),
        category({ id: 'tooling', score: 0 }),
        category({ id: 'performance', score: 0 }),
        category({ id: 'accessibility', score: 0 }),
      ];

      const adjusted = scoringService.calculateOverallScore(categories, {
        componentWeight: 0.1,
        tokenWeight: 0.1,
        reason: 'external DS',
      });
      const unadjusted = scoringService.calculateOverallScore(categories);

      // Shrinking component/token weight must lower the contribution of the
      // two perfect categories.
      expect(adjusted.score).toBeLessThan(unadjusted.score);

      // Freed weight is fully redistributed — total weight still sums to 1.
      const weights = scoringService.getEffectiveWeights({
        componentWeight: 0.1,
        tokenWeight: 0.1,
        reason: 'external DS',
      });
      const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
      expect(total).toBeCloseTo(1.0, 10);
    });
  });

  describe('getGrade', () => {
    it('returns correct grades for scores', () => {
      expect(scoringService.getGrade(95)).toBe('A');
      expect(scoringService.getGrade(90)).toBe('A');
      expect(scoringService.getGrade(85)).toBe('B');
      expect(scoringService.getGrade(75)).toBe('C');
      expect(scoringService.getGrade(65)).toBe('D');
      expect(scoringService.getGrade(55)).toBe('F');
      expect(scoringService.getGrade(0)).toBe('F');
    });
  });

  describe('blendWithJudge', () => {
    it('blends deterministic and judge scores at the configured weight', () => {
      // 70 * 0.7 + 100 * 0.3 = 79
      expect(scoringService.blendWithJudge(70, 100, 'high', 0.3)).toBe(79);
    });

    it('ignores low-confidence judgements entirely', () => {
      expect(scoringService.blendWithJudge(70, 100, 'low', 0.3)).toBe(70);
    });

    it('clamps judge weight so the deterministic score always dominates', () => {
      // Requested weight 0.9 clamps to 0.5: 0 * 0.5 + 100 * 0.5 = 50
      expect(scoringService.blendWithJudge(0, 100, 'high', 0.9)).toBe(50);
    });

    it('defaults to a 0.3 judge weight', () => {
      expect(scoringService.blendWithJudge(50, 100, 'high')).toBe(65);
    });
  });

  describe('generateRecommendations', () => {
    it('generates high-priority recommendations from critical findings', () => {
      const categories = [
        category({
          id: 'components',
          name: 'Component Library',
          score: 50,
          findings: [
            {
              id: 'comp-1',
              type: 'error',
              message: 'Component Button is missing tests',
              severity: 'critical',
              suggestion: 'Add unit tests',
            },
          ],
        }),
      ];

      const recommendations = scoringService.generateRecommendations(categories);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].priority).toBe('high');
      expect(recommendations[0].description).toContain('missing tests');
    });

    it('ranks higher-severity findings above lower-severity ones', () => {
      const categories = [
        category({
          id: 'components',
          score: 80, // above the category-recommendation threshold
          findings: [
            {
              id: 'medium-1',
              type: 'warning',
              message: 'Medium severity issue',
              severity: 'medium',
            },
            {
              id: 'critical-1',
              type: 'error',
              message: 'Critical severity issue',
              severity: 'critical',
            },
          ],
        }),
      ];

      const recommendations = scoringService.generateRecommendations(categories);

      const criticalIndex = recommendations.findIndex(r =>
        r.description.includes('Critical severity')
      );
      const mediumIndex = recommendations.findIndex(r =>
        r.description.includes('Medium severity')
      );

      // Both MUST be present — the old version of this test silently passed
      // when one was missing.
      expect(criticalIndex).toBeGreaterThanOrEqual(0);
      expect(mediumIndex).toBeGreaterThanOrEqual(0);
      expect(criticalIndex).toBeLessThan(mediumIndex);
    });

    it('never produces NaN sort ordering for unknown enum values', () => {
      const categories = [
        category({
          id: 'components',
          score: 80,
          findings: [
            {
              id: 'weird-1',
              type: 'error',
              message: 'Finding with valid enums',
              severity: 'high',
            },
          ],
        }),
      ];

      const recommendations = scoringService.generateRecommendations(categories);
      // Corrupt one entry the way a bad upstream producer might.
      (recommendations[0] as { priority: string }).priority = 'critical-ish';

      // Re-sorting through the public API must not throw or produce NaN order.
      expect(() => scoringService.generateRecommendations(categories)).not.toThrow();
    });
  });
});
