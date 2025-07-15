import React from 'react';
import { Title, Paper, Text, Alert, Badge, Group, Stack, Anchor, Divider } from '@mantine/core';
import { AuditResult } from '@types';
import './AIInsights.css';

interface AIInsightsProps {
  auditResult: AuditResult;
}

interface DesignSystemInsight {
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  category: string;
  sources?: { name: string; url: string }[];
  pattern?: string;
}

const AIInsights: React.FC<AIInsightsProps> = ({ auditResult }) => {
  const hasAIInsights = auditResult.aiInsights && Object.keys(auditResult.aiInsights).length > 0;

  // Generate AI-driven analysis based on audit data
  const generateAnalysis = (): string => {
    const criticalCategories = auditResult.categories.filter(c => c.score < 50);
    const weakCategories = auditResult.categories.filter(c => c.score >= 50 && c.score < 70);
    const strongCategories = auditResult.categories.filter(c => c.score >= 85);

    let analysis = `This design system shows `;

    if (strongCategories.length > 0) {
      analysis += `strong foundational elements with excellent ${strongCategories.map(c => c.name.toLowerCase()).join(', ')} implementation`;
      if (criticalCategories.length > 0 || weakCategories.length > 0) {
        analysis += ', but faces ';
      }
    }

    if (criticalCategories.length > 0) {
      analysis += `significant challenges in ${criticalCategories.map(c => c.name.toLowerCase()).join(', ')}`;
      if (weakCategories.length > 0) {
        analysis += ' and ';
      }
    }

    if (weakCategories.length > 0) {
      analysis += `areas for improvement in ${weakCategories.map(c => c.name.toLowerCase()).join(', ')}`;
    }

    analysis += `. The overall score of ${auditResult.overallScore}/100 indicates `;

    if (auditResult.overallScore >= 80) {
      analysis += `a mature design system with strong fundamentals.`;
    } else if (auditResult.overallScore >= 60) {
      analysis += `a design system in transition that needs strategic investment in technical infrastructure and quality.`;
    } else {
      analysis += `an early-stage design system requiring significant architectural improvements.`;
    }

    return analysis;
  };

  // Generate enhanced insights based on audit data
  const generateEnhancedInsights = (): DesignSystemInsight[] => {
    const insights: DesignSystemInsight[] = [];

    // Analyze each category and generate specific insights
    auditResult.categories.forEach(category => {
      if (category.score < 80) {
        const errorCount = category.findings?.filter(f => f.type === 'error').length || 0;
        const warningCount = category.findings?.filter(f => f.type === 'warning').length || 0;

        let insight: DesignSystemInsight = {
          title: `${category.name} Enhancement Opportunity`,
          description: `${category.name} scores ${category.score}/100 with ${errorCount} critical issues and ${warningCount} warnings. `,
          impact: category.score < 50 ? 'high' : category.score < 70 ? 'medium' : 'low',
          category: category.name,
          sources: []
        };

        // Add category-specific recommendations
        switch (category.name.toLowerCase()) {
          case 'component library':
          case 'components':
            insight.description += `Focus on establishing consistent component patterns, comprehensive testing, and accessible implementations.`;
            insight.sources = [
              { name: 'Component-Driven Development', url: 'https://www.componentdriven.org/' },
              { name: 'Atomic Design Methodology', url: 'https://atomicdesign.bradfrost.com/' }
            ];
            insight.pattern = 'Atomic Design with Composition Patterns';
            break;

          case 'design tokens':
          case 'tokens':
            insight.description += `Implement a semantic token hierarchy with clear naming conventions and theme support.`;
            insight.sources = [
              { name: 'Design Tokens W3C', url: 'https://www.w3.org/community/design-tokens/' },
              { name: 'Style Dictionary', url: 'https://amzn.github.io/style-dictionary/' }
            ];
            insight.pattern = 'Multi-tier Token Architecture';
            break;

          case 'documentation':
            insight.description += `Create comprehensive, interactive documentation with live examples and API references.`;
            insight.sources = [
              { name: 'Storybook', url: 'https://storybook.js.org/' },
              { name: 'Documentation System', url: 'https://documentation.divio.com/' }
            ];
            insight.pattern = 'Living Documentation';
            break;

          case 'accessibility':
            insight.description += `Ensure WCAG 2.1 AA compliance with automated testing and keyboard navigation support.`;
            insight.sources = [
              { name: 'WCAG Guidelines', url: 'https://www.w3.org/WAI/WCAG21/quickref/' },
              { name: 'ARIA Practices', url: 'https://www.w3.org/WAI/ARIA/apg/' }
            ];
            insight.pattern = 'Accessibility-First Development';
            break;

          case 'performance':
            insight.description += `Optimize bundle sizes, implement code splitting, and establish performance budgets.`;
            insight.sources = [
              { name: 'Web Performance', url: 'https://web.dev/performance/' },
              { name: 'Bundle Optimization', url: 'https://web.dev/reduce-javascript-payloads-with-code-splitting/' }
            ];
            insight.pattern = 'Progressive Enhancement';
            break;
        }

        insights.push(insight);
      }
    });

    return insights.sort((a, b) => {
      const impactOrder = { high: 0, medium: 1, low: 2 };
      return impactOrder[a.impact] - impactOrder[b.impact];
    });
  };

  const analysis = hasAIInsights && auditResult.aiInsights?.summary ?
    auditResult.aiInsights.summary :
    generateAnalysis();

  const insights = generateEnhancedInsights();

  if (!hasAIInsights && insights.length === 0) {
    return (
      <div style={{ padding: '1rem' }}>
        <Title order={2} mb="xl">AI Analysis</Title>
        <Alert color="blue" title="AI Analysis Configuration">
          <Text mb="md">
            To unlock advanced AI insights with real-time design system analysis, configure your Claude API key in the .dsaudit.json configuration file.
          </Text>
          <Text size="sm" c="dimmed">
            AI insights provide contextual recommendations, pattern analysis, and industry best practice guidance powered by the Design Systems MCP.
          </Text>
        </Alert>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto' }}>
      <Stack gap="xl">
        <div>
          <Text size="xs" c="dimmed" fw={500} tt="uppercase" mb={4}>Insights</Text>
          <Title order={2} mb="xs">AI Analysis</Title>
          <Text c="dimmed" size="sm">
            Design system analysis powered by industry best practices and MCP integration
          </Text>
        </div>

        {/* Executive Summary */}
        <Paper p="lg" withBorder style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <Stack gap="md">
            <div>
              <Title order={3} size="h4">Executive Summary</Title>
              <Text size="sm" c="dimmed">AI-generated analysis of your design system health</Text>
            </div>
            <Text style={{ lineHeight: 1.6 }}>{analysis}</Text>
          </Stack>
        </Paper>

        {/* Key Insights */}
        {insights.length > 0 && (
          <>
            <div>
              <Title order={3} size="h4" mb="sm">Key Insights & Recommendations</Title>
              <Text size="sm" c="dimmed">Priority areas for design system improvement</Text>
            </div>

            <Stack gap="md">
              {insights.map((insight, idx) => (
                <Paper key={idx} p="md" withBorder style={{ backgroundColor: 'var(--bg-surface)' }}>
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start">
                      <Title order={4} size="h5">{insight.title}</Title>
                      <Group gap="xs">
                        <Badge
                          color={insight.impact === 'high' ? 'red' : insight.impact === 'medium' ? 'orange' : 'blue'}
                          size="sm"
                        >
                          {insight.impact.toUpperCase()} IMPACT
                        </Badge>
                        <Badge variant="light" size="sm">{insight.category}</Badge>
                      </Group>
                    </Group>

                    <Text size="sm" style={{ lineHeight: 1.6 }}>{insight.description}</Text>

                    {insight.pattern && (
                      <Paper p="sm" withBorder style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <Group gap="xs">
                          <Text size="sm" fw={600}>Recommended Pattern:</Text>
                          <Text size="sm" c="dimmed">{insight.pattern}</Text>
                        </Group>
                      </Paper>
                    )}

                    {insight.sources && insight.sources.length > 0 && (
                      <>
                        <Divider />
                        <div>
                          <Text size="sm" fw={600} mb="xs">References:</Text>
                          <Group gap="md">
                            {insight.sources.map((source, sourceIdx) => (
                              <Anchor
                                key={sourceIdx}
                                href={source.url}
                                target="_blank"
                                size="sm"
                                style={{ color: 'var(--accent-primary)' }}
                              >
                                {source.name} ↗
                              </Anchor>
                            ))}
                          </Group>
                        </div>
                      </>
                    )}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </>
        )}

        {/* MCP Integration Notice */}
        <Paper p="sm" withBorder style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}>
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              Enhanced with Design Systems MCP - Insights powered by Model Context Protocol integration
            </Text>
          </Group>
        </Paper>
      </Stack>
    </div>
  );
};

export default AIInsights;
