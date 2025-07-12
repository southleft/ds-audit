import type { CategoryResult, Recommendation } from '../types/index.js';

export class ScoringService {
  private readonly gradeThresholds = [
    { grade: 'A', minScore: 90 },
    { grade: 'B', minScore: 80 },
    { grade: 'C', minScore: 70 },
    { grade: 'D', minScore: 60 },
    { grade: 'F', minScore: 0 },
  ];

  private readonly categoryWeights: Record<string, number> = {
    components: 0.25,
    tokens: 0.20,
    documentation: 0.15,
    governance: 0.10,
    tooling: 0.10,
    performance: 0.10,
    accessibility: 0.10,
  };

  calculateOverallScore(categoryResults: CategoryResult[]): { score: number; grade: string } {
    let weightedSum = 0;
    let totalWeight = 0;

    categoryResults.forEach(category => {
      const weight = this.categoryWeights[category.id] || 0.1;
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
      const warnings = category.findings.filter(f => f.type === 'warning');

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

      // Category-specific recommendations based on score
      if (category.score < 60) {
        recommendations.push(...this.generateCategoryRecommendations(category, recommendationId));
        recommendationId += 5; // Reserve space for category recommendations
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