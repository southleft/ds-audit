import type { CategoryResult, Finding, Recommendation } from '../types/index.js';

/**
 * Single source of truth for category weights. Auditors must not declare
 * their own weights — the engine stamps these onto results.
 * 6 categories (governance merged into documentation). Sums to 1.00.
 */
export const CATEGORY_WEIGHTS: Record<string, number> = {
  components: 0.25,
  tokens: 0.2,
  documentation: 0.2,
  tooling: 0.12,
  performance: 0.1,
  accessibility: 0.13,
};

const GRADE_THRESHOLDS = [
  { grade: 'A', minScore: 90 },
  { grade: 'B', minScore: 80 },
  { grade: 'C', minScore: 70 },
  { grade: 'D', minScore: 60 },
  { grade: 'F', minScore: 0 },
];

export class ScoringService {
  /**
   * Effective weights after optional external-DS adjustment. When a project
   * is built on an external design system (e.g. Mantine, MUI), component and
   * token weights shrink and the freed weight shifts to documentation,
   * accessibility, and tooling (40/30/30).
   */
  getEffectiveWeights(externalDSAdjustment?: {
    componentWeight: number;
    tokenWeight: number;
    reason: string;
  }): Record<string, number> {
    const weights = { ...CATEGORY_WEIGHTS };

    if (externalDSAdjustment) {
      weights.components = externalDSAdjustment.componentWeight;
      weights.tokens = externalDSAdjustment.tokenWeight;

      const freed =
        CATEGORY_WEIGHTS.components +
        CATEGORY_WEIGHTS.tokens -
        externalDSAdjustment.componentWeight -
        externalDSAdjustment.tokenWeight;

      if (freed > 0) {
        weights.documentation += freed * 0.4;
        weights.accessibility += freed * 0.3;
        weights.tooling += freed * 0.3;
      }
    }

    return weights;
  }

  /**
   * Weighted average over the categories that actually completed. Categories
   * with unknown IDs are excluded (never given a made-up weight). Callers are
   * responsible for marking the result partial when categories are missing.
   */
  calculateOverallScore(
    categoryResults: CategoryResult[],
    externalDSAdjustment?: { componentWeight: number; tokenWeight: number; reason: string }
  ): { score: number; grade: string } {
    const weights = this.getEffectiveWeights(externalDSAdjustment);

    let weightedSum = 0;
    let totalWeight = 0;

    for (const category of categoryResults) {
      const weight = weights[category.id];
      if (weight === undefined) continue;
      weightedSum += category.score * weight;
      totalWeight += weight;
    }

    const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
    return { score, grade: this.getGrade(score) };
  }

  getGrade(score: number): string {
    const threshold = GRADE_THRESHOLDS.find(t => score >= t.minScore);
    return threshold?.grade || 'F';
  }

  /**
   * Blend a deterministic score with an LLM judge score. The judge weight is
   * clamped to [0, 0.5] — the deterministic score always dominates — and a
   * low-confidence judgement is not blended at all.
   */
  blendWithJudge(
    deterministicScore: number,
    judgeScore: number,
    judgeConfidence: 'low' | 'medium' | 'high',
    judgeWeight = 0.3
  ): number {
    if (judgeConfidence === 'low') return deterministicScore;
    const w = Math.min(Math.max(judgeWeight, 0), 0.5);
    return Math.round(deterministicScore * (1 - w) + judgeScore * w);
  }

  generateRecommendations(categoryResults: CategoryResult[]): Recommendation[] {
    const recommendations: Recommendation[] = [];
    let recommendationId = 1;

    categoryResults.forEach(category => {
      const criticalFindings = category.findings.filter(f => f.severity === 'critical');
      const highFindings = category.findings.filter(f => f.severity === 'high');
      const mediumFindings = category.findings.filter(
        f => f.severity === 'medium' && f.type !== 'success'
      );

      criticalFindings.forEach(finding => {
        recommendations.push({
          id: `rec-${recommendationId++}`,
          title: `Fix critical issue in ${category.name}`,
          description: finding.message,
          priority: 'high',
          effort: this.estimateEffort(finding),
          impact: 'high',
          category: category.id,
          implementation: finding.suggestion,
        });
      });

      highFindings.forEach(finding => {
        recommendations.push({
          id: `rec-${recommendationId++}`,
          title: `Address issue in ${category.name}`,
          description: finding.message,
          priority: 'medium',
          effort: this.estimateEffort(finding),
          impact: 'medium',
          category: category.id,
          implementation: finding.suggestion,
        });
      });

      // Limit medium findings to the top 5 per category to avoid overwhelming
      mediumFindings.slice(0, 5).forEach(finding => {
        recommendations.push({
          id: `rec-${recommendationId++}`,
          title: `Improve ${category.name}`,
          description: finding.message,
          priority: 'low',
          effort: this.estimateEffort(finding),
          impact: 'medium',
          category: category.id,
          implementation: finding.suggestion,
        });
      });

      if (category.score < 70) {
        recommendations.push(...this.generateCategoryRecommendations(category, recommendationId));
        recommendationId += 6;
      }
    });

    return this.prioritizeRecommendations(recommendations);
  }

  private estimateEffort(finding: Finding): 'quick-win' | 'medium-lift' | 'heavy-lift' {
    const message = finding.message.toLowerCase();
    if (/\b(refactor|restructure|migrate|rewrite|architecture)\b/.test(message)) {
      return 'heavy-lift';
    }
    // Creating a single missing file or config entry is genuinely quick.
    if (/\b(missing|not found|add|enable|install|configure)\b/.test(message)) {
      return 'quick-win';
    }
    return 'medium-lift';
  }

  private generateCategoryRecommendations(
    category: CategoryResult,
    startId: number
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    switch (category.id) {
      case 'components':
        if (category.score < 60) {
          recommendations.push({
            id: `rec-${startId}`,
            title: 'Establish Component Architecture',
            description: 'Create a consistent component structure with atomic design principles',
            priority: 'high',
            effort: 'heavy-lift',
            impact: 'high',
            category: 'components',
            implementation:
              'Start by categorizing existing components into atoms, molecules, and organisms',
          });
        }
        break;

      case 'tokens':
        if (category.score < 70) {
          recommendations.push({
            id: `rec-${startId + 1}`,
            title: 'Implement Design Token System',
            description: 'Create a comprehensive token system for colors, spacing, and typography',
            priority: 'high',
            effort: 'medium-lift',
            impact: 'high',
            category: 'tokens',
            implementation: 'Use Style Dictionary or similar tool to manage design tokens',
          });
        }
        break;

      case 'documentation':
        if (category.score < 50) {
          recommendations.push({
            id: `rec-${startId + 2}`,
            title: 'Create Component Documentation',
            description: 'Document all components with props, usage examples, and guidelines',
            priority: 'medium',
            effort: 'medium-lift',
            impact: 'medium',
            category: 'documentation',
            implementation: 'Use Storybook or similar tool for interactive documentation',
          });
        }
        break;

      case 'tooling':
        if (category.score < 60) {
          recommendations.push({
            id: `rec-${startId + 3}`,
            title: 'Improve Build and Development Tooling',
            description: 'Enhance build tools, testing infrastructure, and developer experience',
            priority: 'medium',
            effort: 'medium-lift',
            impact: 'high',
            category: 'tooling',
            implementation:
              'Add modern bundler (Vite), testing framework, CI/CD pipeline, and linting tools',
          });
        }
        break;

      case 'performance':
        if (category.score < 60) {
          recommendations.push({
            id: `rec-${startId + 4}`,
            title: 'Optimize Library Packaging',
            description:
              'Improve how the design system is packaged so consuming apps get small, tree-shakeable bundles',
            priority: 'medium',
            effort: 'medium-lift',
            impact: 'high',
            category: 'performance',
            implementation:
              'Add a sideEffects declaration, an exports map with ESM entries, and per-entry size tracking',
          });
        }
        break;

      case 'accessibility':
        if (category.score < 70) {
          recommendations.push({
            id: `rec-${startId + 5}`,
            title: 'Adopt Accessibility Testing',
            description:
              'Add automated accessibility verification so regressions are caught before release',
            priority: 'high',
            effort: 'medium-lift',
            impact: 'high',
            category: 'accessibility',
            implementation:
              'Add eslint-plugin-jsx-a11y, jest-axe (or axe-core in Storybook), and fix reported violations',
          });
        }
        break;
    }

    return recommendations;
  }

  private prioritizeRecommendations(recommendations: Recommendation[]): Recommendation[] {
    const priorityScore: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const impactScore: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const effortScore: Record<string, number> = {
      'quick-win': 3,
      'medium-lift': 2,
      'heavy-lift': 1,
    };

    return recommendations.sort((a, b) => {
      // Unknown enum values (e.g. from bad upstream data) sort last instead
      // of producing NaN comparisons.
      const scoreA =
        (priorityScore[a.priority] ?? 0) * (impactScore[a.impact] ?? 0) * (effortScore[a.effort] ?? 0);
      const scoreB =
        (priorityScore[b.priority] ?? 0) * (impactScore[b.impact] ?? 0) * (effortScore[b.effort] ?? 0);
      return scoreB - scoreA;
    });
  }
}
