import React, { useState } from 'react';
import { Title, Card, Text, Alert, List, Badge, Group, Button, Anchor, Stack, Divider } from '@mantine/core';
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
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  const hasAIInsights = auditResult.aiInsights && Object.keys(auditResult.aiInsights).length > 0;
  
  // Generate enhanced insights based on audit data
  const generateEnhancedInsights = (): DesignSystemInsight[] => {
    const insights: DesignSystemInsight[] = [];
    
    // Analyze components
    const componentsCategory = auditResult.categories.find(cat => cat.name.toLowerCase().includes('component'));
    if (componentsCategory && componentsCategory.score < 80) {
      insights.push({
        title: 'Component Architecture Enhancement',
        description: `Your component library scores ${componentsCategory.score}/100. Based on industry best practices from Material Design and Carbon Design System, consider implementing consistent component composition patterns, prop interfaces, and documentation standards.`,
        impact: 'high',
        category: 'Components',
        sources: [
          { name: 'Material Design Components', url: 'https://material.io/components' },
          { name: 'Carbon Design System', url: 'https://carbondesignsystem.com' }
        ],
        pattern: 'Atomic Design Pattern'
      });
    }
    
    // Analyze tokens
    const tokensCategory = auditResult.categories.find(cat => cat.name.toLowerCase().includes('token'));
    if (tokensCategory && tokensCategory.score < 75) {
      insights.push({
        title: 'Design Token Strategy',
        description: `Token implementation could be strengthened (${tokensCategory.score}/100). Leading design systems like Polaris and Atlassian use semantic token hierarchies with tier-based naming conventions for better maintainability and theming support.`,
        impact: 'high',
        category: 'Tokens',
        sources: [
          { name: 'Shopify Polaris Tokens', url: 'https://polaris.shopify.com/tokens' },
          { name: 'Atlassian Design Tokens', url: 'https://atlassian.design/foundations/design-tokens' }
        ],
        pattern: 'Semantic Token Architecture'
      });
    }
    
    // Analyze accessibility
    const a11yCategory = auditResult.categories.find(cat => cat.name.toLowerCase().includes('accessibility'));
    if (a11yCategory && a11yCategory.score < 85) {
      insights.push({
        title: 'Accessibility Excellence',
        description: `Accessibility implementation shows room for improvement (${a11yCategory.score}/100). Following WCAG 2.1 AA standards and patterns from accessible design systems like Gov.UK and US Web Design System can significantly enhance user experience.`,
        impact: 'high',
        category: 'Accessibility',
        sources: [
          { name: 'WCAG 2.1 Guidelines', url: 'https://www.w3.org/WAI/WCAG21/quickref/' },
          { name: 'US Web Design System', url: 'https://designsystem.digital.gov' }
        ],
        pattern: 'WCAG 2.1 AA Compliance'
      });
    }
    
    // Performance insights
    const perfCategory = auditResult.categories.find(cat => cat.name.toLowerCase().includes('performance'));
    if (perfCategory && perfCategory.score < 80) {
      insights.push({
        title: 'Performance Optimization',
        description: `Performance metrics indicate optimization opportunities (${perfCategory.score}/100). Consider implementing tree-shaking, code splitting, and optimized component bundling strategies used by systems like Ant Design and Chakra UI.`,
        impact: 'medium',
        category: 'Performance',
        sources: [
          { name: 'Ant Design Bundle Optimization', url: 'https://ant.design/docs/react/getting-started#Bundle-optimization' },
          { name: 'Chakra UI Performance', url: 'https://chakra-ui.com/guides/getting-started' }
        ],
        pattern: 'Progressive Bundle Loading'
      });
    }
    
    // Documentation insights
    const docsCategory = auditResult.categories.find(cat => cat.name.toLowerCase().includes('documentation'));
    if (docsCategory && docsCategory.score < 75) {
      insights.push({
        title: 'Documentation Excellence',
        description: `Documentation quality could be enhanced (${docsCategory.score}/100). Implement comprehensive examples, API documentation, and interactive playgrounds following patterns from Storybook and Figma design systems.`,
        impact: 'medium',
        category: 'Documentation',
        sources: [
          { name: 'Storybook Documentation', url: 'https://storybook.js.org/docs' },
          { name: 'Figma Design System', url: 'https://www.figma.com/design-systems/' }
        ],
        pattern: 'Living Documentation'
      });
    }
    
    return insights;
  };
  
  const enhancedInsights = generateEnhancedInsights();
  const categories = ['all', ...new Set(enhancedInsights.map(insight => insight.category))];
  const filteredInsights = selectedCategory === 'all' 
    ? enhancedInsights 
    : enhancedInsights.filter(insight => insight.category === selectedCategory);
  
  if (!hasAIInsights && enhancedInsights.length === 0) {
    return (
      <div className="ai-insights-container">
        <Title order={2} mb="xl">AI-Powered Insights</Title>
        <Alert color="blue" title="AI Analysis Configuration" className="config-alert">
          <Text mb="md">
            To unlock advanced AI insights with real-time design system analysis, configure your Claude API key in the .dsaudit.json configuration file.
          </Text>
          <Text size="sm" c="dimmed">
            AI insights provide contextual recommendations, pattern analysis, and industry best practice guidance.
          </Text>
        </Alert>
      </div>
    );
  }

  return (
    <div className="ai-insights-container">
      <div className="insights-header">
        <Title order={2} className="insights-title">🤖 AI-Powered Insights</Title>
        <Text c="dimmed" size="lg" className="insights-subtitle">
          Design system analysis powered by industry best practices and MCP integration
        </Text>
      </div>

      {/* Category Filter */}
      <div className="category-filter">
        <Group gap="xs">
          {categories.map(category => (
            <Button
              key={category}
              size="sm"
              variant={selectedCategory === category ? 'filled' : 'light'}
              onClick={() => setSelectedCategory(category)}
              className="filter-btn"
            >
              {category === 'all' ? 'All Insights' : category}
            </Button>
          ))}
        </Group>
      </div>

      {/* AI Summary Section */}
      {auditResult.aiInsights?.summary && (
        <Card className="executive-summary-card">
          <div className="summary-header">
            <div className="summary-icon">📊</div>
            <div>
              <Title order={3}>Executive Summary</Title>
              <Text size="sm" c="dimmed">AI-generated analysis of your design system health</Text>
            </div>
          </div>
          <Text className="summary-content">{auditResult.aiInsights.summary}</Text>
        </Card>
      )}

      {/* Enhanced Insights Grid */}
      <div className="insights-grid">
        {filteredInsights.map((insight, idx) => (
          <Card key={idx} className={`insight-detail-card impact-${insight.impact}`}>
            <div className="insight-header">
              <Badge 
                color={insight.impact === 'high' ? 'red' : insight.impact === 'medium' ? 'orange' : 'blue'}
                size="sm"
                className="impact-badge"
              >
                {insight.impact.toUpperCase()} IMPACT
              </Badge>
              <Badge variant="light" size="sm">{insight.category}</Badge>
            </div>
            
            <Title order={4} className="insight-title">{insight.title}</Title>
            <Text className="insight-description">{insight.description}</Text>
            
            {insight.pattern && (
              <div className="pattern-info">
                <Text size="sm" fw={600} c="blue">📐 Recommended Pattern:</Text>
                <Text size="sm" c="dimmed">{insight.pattern}</Text>
              </div>
            )}
            
            {insight.sources && insight.sources.length > 0 && (
              <div className="sources-section">
                <Text size="sm" fw={600} mb="xs">📚 References:</Text>
                <Stack gap="xs">
                  {insight.sources.map((source, sourceIdx) => (
                    <Anchor 
                      key={sourceIdx} 
                      href={source.url} 
                      target="_blank"
                      size="sm"
                      className="source-link"
                    >
                      {source.name} ↗
                    </Anchor>
                  ))}
                </Stack>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Pattern Analysis */}
      {auditResult.aiInsights?.patterns && (
        <Card className="patterns-card">
          <Title order={3} mb="md">🎯 Detected Patterns</Title>
          <Text size="sm" c="dimmed" mb="lg">Common patterns and anti-patterns identified in your design system</Text>
          <div className="patterns-grid">
            {auditResult.aiInsights.patterns.map((pattern: string, idx: number) => (
              <div key={idx} className="pattern-item">
                <Text size="sm">{pattern}</Text>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Strategic Recommendations */}
      {auditResult.aiInsights?.suggestions && (
        <Card className="strategic-recommendations-card">
          <Title order={3} mb="md">🎯 Strategic Recommendations</Title>
          <Text size="sm" c="dimmed" mb="lg">Priority actions for design system maturity</Text>
          <div className="recommendations-list">
            {auditResult.aiInsights.suggestions.map((suggestion: any, idx: number) => (
              <div key={idx} className="recommendation-item">
                <div className="recommendation-header">
                  <Badge color="violet" size="sm">{suggestion.category}</Badge>
                  <Text fw={600} className="recommendation-title">{suggestion.title}</Text>
                </div>
                <Text size="sm" c="dimmed" className="recommendation-description">
                  {suggestion.description}
                </Text>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* MCP Integration Footer */}
      <Card className="mcp-info-card">
        <Group>
          <div className="mcp-icon">🔌</div>
          <div>
            <Text fw={600} size="sm">Enhanced with Design Systems MCP</Text>
            <Text size="xs" c="dimmed">
              Insights powered by Model Context Protocol integration with leading design system knowledge bases
            </Text>
          </div>
        </Group>
      </Card>
    </div>
  );
};

export default AIInsights;