import { ScoringService } from '../core/ScoringService';
import type { CategoryResult } from '../types/index';

describe('ScoringService', () => {
  let scoringService: ScoringService;

  beforeEach(() => {
    scoringService = new ScoringService();
  });

  describe('calculateOverallScore', () => {
    it('should calculate weighted average correctly', () => {
      const categories: CategoryResult[] = [
        {
          id: 'components',
          name: 'Components',
          score: 80,
          grade: 'B',
          weight: 0.25,
          findings: [],
          metrics: {},
        },
        {
          id: 'tokens',
          name: 'Tokens',
          score: 90,
          grade: 'A',
          weight: 0.20,
          findings: [],
          metrics: {},
        },
      ];

      const result = scoringService.calculateOverallScore(categories);
      
      // (80 * 0.25 + 90 * 0.20) / (0.25 + 0.20) = 84.44
      expect(result.score).toBe(84);
      expect(result.grade).toBe('B');
    });

    it('should handle empty categories', () => {
      const result = scoringService.calculateOverallScore([]);
      expect(result.score).toBe(0);
      expect(result.grade).toBe('F');
    });
  });

  describe('getGrade', () => {
    it('should return correct grades for scores', () => {
      expect(scoringService.getGrade(95)).toBe('A');
      expect(scoringService.getGrade(85)).toBe('B');
      expect(scoringService.getGrade(75)).toBe('C');
      expect(scoringService.getGrade(65)).toBe('D');
      expect(scoringService.getGrade(55)).toBe('F');
      expect(scoringService.getGrade(0)).toBe('F');
    });
  });

  describe('generateRecommendations', () => {
    it('should generate recommendations from critical findings', () => {
      const categories: CategoryResult[] = [
        {
          id: 'components',
          name: 'Component Library',
          score: 50,
          grade: 'F',
          weight: 0.25,
          findings: [
            {
              id: 'comp-1',
              type: 'error',
              message: 'Missing tests',
              severity: 'critical',
              suggestion: 'Add unit tests',
            },
          ],
          metrics: {},
        },
      ];

      const recommendations = scoringService.generateRecommendations(categories);
      
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].priority).toBe('high');
      expect(recommendations[0].description).toContain('Missing tests');
    });

    it('should prioritize recommendations correctly', () => {
      const categories: CategoryResult[] = [
        {
          id: 'components',
          name: 'Components',
          score: 60,
          grade: 'D',
          weight: 0.25,
          findings: [
            {
              id: 'low-1',
              type: 'info',
              message: 'Low priority issue',
              severity: 'low',
            },
            {
              id: 'high-1',
              type: 'error',
              message: 'High priority issue',
              severity: 'high',
            },
          ],
          metrics: {},
        },
      ];

      const recommendations = scoringService.generateRecommendations(categories);
      
      // High priority should come first
      const highPriorityIndex = recommendations.findIndex(r => r.description.includes('High priority'));
      const lowPriorityIndex = recommendations.findIndex(r => r.description.includes('Low priority'));
      
      if (highPriorityIndex !== -1 && lowPriorityIndex !== -1) {
        expect(highPriorityIndex).toBeLessThan(lowPriorityIndex);
      }
    });
  });
});