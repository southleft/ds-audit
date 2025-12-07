import type { CategoryResult, Recommendation } from '../types/index.js';

export class ScoringService {
  private readonly gradeThresholds = [
    { grade: 'A', minScore: 90 },
    { grade: 'B', minScore: 80 },
    { grade: 'C', minScore: 70 },
    { grade: 'D', minScore: 60 },
    { grade: 'F', minScore: 0 },
  ];

  // 6 categories (governance merged into documentation)
  private readonly categoryWeights: Record<string, number> = {
    components: 0.25,
    tokens: 0.20,
    documentation: 0.20,  // Increased from 0.15 (absorbed governance)
    tooling: 0.12,        // Slight increase
    performance: 0.10,
    accessibility: 0.13,  // Slight increase
  };

  /**
   * Calculate the overall score with optional external DS adjustment
   * @param categoryResults - Category results from auditors
   * @param externalDSAdjustment - Optional adjustment for external design system usage
   */
  calculateOverallScore(
    categoryResults: CategoryResult[],
    externalDSAdjustment?: { componentWeight: number; tokenWeight: number; reason: string }
  ): { score: number; grade: string } {
    let weightedSum = 0;
    let totalWeight = 0;

    // Apply external DS weight adjustments if provided
    const adjustedWeights = { ...this.categoryWeights };
    if (externalDSAdjustment) {
      adjustedWeights.components = externalDSAdjustment.componentWeight;
      adjustedWeights.tokens = externalDSAdjustment.tokenWeight;

      // Redistribute the weight difference to other categories
      const originalTotal = this.categoryWeights.components + this.categoryWeights.tokens;
      const newTotal = externalDSAdjustment.componentWeight + externalDSAdjustment.tokenWeight;
      const difference = originalTotal - newTotal;

      // Add extra weight to documentation and accessibility for external DS projects
      if (difference > 0) {
        adjustedWeights.documentation = (adjustedWeights.documentation || 0.15) + difference * 0.4;
        adjustedWeights.accessibility = (adjustedWeights.accessibility || 0.10) + difference * 0.3;
        adjustedWeights.tooling = (adjustedWeights.tooling || 0.10) + difference * 0.3;
      }
    }

    categoryResults.forEach(category => {
      const weight = adjustedWeights[category.id] || 0.1;
      weightedSum += category.score * weight;
      totalWeight += weight;
    });

    const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
    const grade = this.getGrade(score);

    return { score, grade };
  }

  getGrade(score: number): string {
    const threshold = this.gradeThresholds.find(t => score >= t.minScore);
    return threshold?.grade || 'F';
  }

  generateRecommendations(categoryResults: CategoryResult[]): Recommendation[] {
    const recommendations: Recommendation[] = [];
    let recommendationId = 1;

    categoryResults.forEach(category => {
      // Generate recommendations based on findings
      const criticalFindings = category.findings.filter(f => f.severity === 'critical');
      const highFindings = category.findings.filter(f => f.severity === 'high');
      const mediumFindings = category.findings.filter(f => f.severity === 'medium' || f.type === 'warning');

      // Critical issues become high priority recommendations
      criticalFindings.forEach(finding => {
        recommendations.push({
          id: `rec-${recommendationId++}`,
          title: `Fix critical issue in ${category.name}`,
          description: finding.message,
          priority: 'high',
          effort: 'medium-lift',
          impact: 'high',
          category: category.id,
          implementation: finding.suggestion,
        });
      });

      // High severity findings
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

      // Medium severity findings and warnings (limit to top 5 per category to avoid overwhelming)
      const topMediumFindings = mediumFindings.slice(0, 5);
      topMediumFindings.forEach(finding => {
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

      // Category-specific recommendations based on score
      if (category.score < 70) {
        recommendations.push(...this.generateCategoryRecommendations(category, recommendationId));
        recommendationId += 6; // Reserve space for category recommendations
      }
    });

    // Sort by priority and impact
    return this.prioritizeRecommendations(recommendations);
  }

  private estimateEffort(finding: any): 'quick-win' | 'medium-lift' | 'heavy-lift' {
    // Simple heuristic based on finding type
    if (finding.message.includes('missing') || finding.message.includes('add')) {
      return 'quick-win';
    }
    if (finding.message.includes('refactor') || finding.message.includes('restructure')) {
      return 'heavy-lift';
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
            implementation: 'Start by categorizing existing components into atoms, molecules, and organisms',
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
            implementation: 'Add modern bundler (Vite), testing framework, CI/CD pipeline, and linting tools',
          });
        }
        break;

      case 'performance':
        if (category.score < 60) {
          recommendations.push({
            id: `rec-${startId + 4}`,
            title: 'Optimize Performance',
            description: 'Implement performance optimizations for faster load times and better user experience',
            priority: 'medium',
            effort: 'medium-lift',
            impact: 'high',
            category: 'performance',
            implementation: 'Add code splitting, lazy loading, optimize images, and implement bundle analysis',
          });
        }
        break;

      case 'accessibility':
        if (category.score < 70) {
          recommendations.push({
            id: `rec-${startId + 5}`,
            title: 'Enhance Accessibility Compliance',
            description: 'Improve accessibility to meet WCAG standards and support all users',
            priority: 'high',
            effort: 'medium-lift',
            impact: 'high',
            category: 'accessibility',
            implementation: 'Add ARIA labels, keyboard navigation, focus management, and screen reader support',
          });
        }
        break;
    }

    return recommendations;
  }

  private prioritizeRecommendations(recommendations: Recommendation[]): Recommendation[] {
    return recommendations.sort((a, b) => {
      // Priority scoring
      const priorityScore: Record<string, number> = { high: 3, medium: 2, low: 1 };
      const impactScore: Record<string, number> = { high: 3, medium: 2, low: 1 };
      const effortScore: Record<string, number> = { 'quick-win': 3, 'medium-lift': 2, 'heavy-lift': 1 };

      const scoreA = priorityScore[a.priority] * impactScore[a.impact] * effortScore[a.effort];
      const scoreB = priorityScore[b.priority] * impactScore[b.impact] * effortScore[b.effort];

      return scoreB - scoreA;
    });
  }
}