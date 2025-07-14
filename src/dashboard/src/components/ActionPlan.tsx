import React from 'react';
import { Title, Card, Badge, Text, Group, Stack } from '@mantine/core';
import { AuditResult, CategoryResult } from '@types';
import './ActionPlan.css';

interface ActionPlanProps {
  auditResult: AuditResult;
}

interface StrategicInitiative {
  title: string;
  description: string;
  impact: string;
  recommendations: string[];
  category?: string;
  type: 'architecture' | 'process' | 'quality' | 'innovation';
}

interface StrategicTheme {
  theme: string;
  description: string;
  icon: string;
  initiatives: StrategicInitiative[];
}

const ActionPlan: React.FC<ActionPlanProps> = ({ auditResult }) => {
  // Analyze audit results to generate strategic long-term goals
  const generateStrategicThemes = (): StrategicTheme[] => {
    const themes: StrategicTheme[] = [];
    
    // Categorize by severity
    const criticalCategories = auditResult.categories.filter(c => c.score < 50);
    const needsImprovementCategories = auditResult.categories.filter(c => c.score >= 50 && c.score < 70);
    const needsPolishCategories = auditResult.categories.filter(c => c.score >= 70 && c.score < 85);
    const strongCategories = auditResult.categories.filter(c => c.score >= 85);

    // Analyze findings patterns
    const allFindings = auditResult.categories.flatMap(c => c.findings || []);
    const errorCount = allFindings.filter(f => f.type === 'error').length;
    const warningCount = allFindings.filter(f => f.type === 'warning').length;
    
    // Pattern detection
    const hasTestingIssues = allFindings.filter(f => 
      f.message.toLowerCase().includes('test') || 
      f.message.toLowerCase().includes('spec')
    ).length > 10;
    
    const hasDocumentationIssues = allFindings.filter(f => 
      f.message.toLowerCase().includes('documentation') || 
      f.message.toLowerCase().includes('readme') ||
      f.message.toLowerCase().includes('storybook')
    ).length > 20;
    
    const hasAccessibilityIssues = allFindings.filter(f => 
      f.message.toLowerCase().includes('aria') || 
      f.message.toLowerCase().includes('accessibility') ||
      f.message.toLowerCase().includes('a11y')
    ).length > 15;
    
    const hasTypeScriptIssues = allFindings.filter(f => 
      f.message.toLowerCase().includes('type') || 
      f.message.toLowerCase().includes('interface') ||
      f.message.toLowerCase().includes('typescript')
    ).length > 10;

    // ARCHITECTURE & FRAMEWORK EVOLUTION
    const architectureInitiatives: StrategicInitiative[] = [];
    
    // Component Architecture
    const componentScore = auditResult.categories.find(c => c.name === 'Component Library')?.score || 0;
    if (componentScore < 80 || hasTypeScriptIssues) {
      architectureInitiatives.push({
        title: 'Component Architecture Modernization',
        description: `Transform component library into a scalable, type-safe system`,
        impact: 'Enables rapid feature development with 90% fewer bugs',
        recommendations: [
          'Adopt compound component patterns for complex UI',
          'Implement proper TypeScript generics and discriminated unions',
          'Create composable hooks for shared logic',
          'Establish atomic design principles'
        ],
        type: 'architecture'
      });
    }

    // Token System Architecture
    const tokenScore = auditResult.categories.find(c => c.name === 'Design Tokens')?.score || 0;
    if (tokenScore < 80) {
      const tokenFindings = auditResult.categories.find(c => c.name === 'Design Tokens')?.findings || [];
      architectureInitiatives.push({
        title: 'Design Token System Evolution',
        description: `Build a multi-tier token architecture for true design flexibility`,
        impact: 'Reduces design-to-code time by 75% and enables instant theming',
        recommendations: [
          'Implement semantic token layers above primitives',
          'Create platform-specific token transformations',
          'Build token documentation and visualization tools',
          'Integrate tokens with component props system'
        ],
        category: 'Design Tokens',
        type: 'architecture'
      });
    }

    // Performance Architecture
    const perfScore = auditResult.categories.find(c => c.name === 'Performance')?.score || 0;
    if (perfScore < 80) {
      architectureInitiatives.push({
        title: 'Performance-First Architecture',
        description: 'Implement systematic performance optimization strategies',
        impact: 'Achieves sub-second load times and improves developer velocity',
        recommendations: [
          'Implement code splitting and lazy loading patterns',
          'Create performance budgets and monitoring',
          'Optimize build pipeline for tree shaking',
          'Establish performance testing in CI/CD'
        ],
        category: 'Performance',
        type: 'architecture'
      });
    }

    if (architectureInitiatives.length > 0) {
      themes.push({
        theme: 'Architecture & Framework Evolution',
        description: 'Strategic improvements to the technical foundation that enable scalability and maintainability',
        icon: '🏗️',
        initiatives: architectureInitiatives
      });
    }

    // QUALITY & TESTING EXCELLENCE
    const qualityInitiatives: StrategicInitiative[] = [];

    // Testing Strategy
    if (hasTestingIssues || criticalCategories.some(c => c.name === 'Component Library')) {
      qualityInitiatives.push({
        title: 'Comprehensive Testing Strategy',
        description: 'Build a multi-layer testing approach for bulletproof components',
        impact: 'Prevents regressions and enables fearless refactoring',
        recommendations: [
          'Implement visual regression testing with screenshot comparisons',
          'Create interaction testing for complex user flows',
          'Build accessibility testing into every component',
          'Establish property-based testing for edge cases'
        ],
        type: 'quality'
      });
    }

    // Documentation Excellence
    const docScore = auditResult.categories.find(c => c.name === 'Documentation')?.score ?? 100;
    if (hasDocumentationIssues || docScore < 80) {
      qualityInitiatives.push({
        title: 'Living Documentation System',
        description: 'Create self-maintaining documentation that evolves with the code',
        impact: 'Eliminates documentation drift and accelerates onboarding',
        recommendations: [
          'Generate docs from TypeScript types and JSDoc comments',
          'Build interactive playgrounds for every component',
          'Create automated changelog generation',
          'Implement documentation linting and validation'
        ],
        category: 'Documentation',
        type: 'quality'
      });
    }

    // Accessibility Excellence
    const accessibilityScore = auditResult.categories.find(c => c.name === 'Accessibility')?.score ?? 100;
    if (hasAccessibilityIssues || accessibilityScore < 85) {
      qualityInitiatives.push({
        title: 'Accessibility-First Development',
        description: 'Make accessibility a core feature, not an afterthought',
        impact: 'Expands usable audience and ensures legal compliance',
        recommendations: [
          'Build accessibility into component APIs by default',
          'Create automated WCAG compliance checking',
          'Implement keyboard navigation patterns library',
          'Establish screen reader testing protocols'
        ],
        category: 'Accessibility',
        type: 'quality'
      });
    }

    if (qualityInitiatives.length > 0) {
      themes.push({
        theme: 'Quality & Testing Excellence',
        description: 'Systematic approaches to ensure reliability, accessibility, and maintainability',
        icon: '✨',
        initiatives: qualityInitiatives
      });
    }

    // PROCESS & GOVERNANCE
    const processInitiatives: StrategicInitiative[] = [];

    // Governance Maturity
    const governanceScore = auditResult.categories.find(c => c.name === 'Governance')?.score || 0;
    if (governanceScore < 80) {
      processInitiatives.push({
        title: 'Design System Governance Model',
        description: 'Establish processes for sustainable growth and community ownership',
        impact: 'Ensures consistent evolution and prevents fragmentation',
        recommendations: [
          'Create a Design System Committee with clear roles',
          'Implement RFC process for major changes',
          'Build contribution guidelines and review processes',
          'Establish deprecation and migration strategies'
        ],
        category: 'Governance',
        type: 'process'
      });
    }

    // Tooling Excellence
    const toolingScore = auditResult.categories.find(c => c.name === 'Tooling')?.score || 0;
    if (toolingScore < 80) {
      processInitiatives.push({
        title: 'Developer Experience Optimization',
        description: 'Create frictionless workflows that make the right thing the easy thing',
        impact: 'Increases adoption and reduces time-to-market',
        recommendations: [
          'Build CLI tools for common design system tasks',
          'Create IDE extensions for component discovery',
          'Implement automated dependency updates',
          'Establish continuous deployment pipeline'
        ],
        category: 'Tooling',
        type: 'process'
      });
    }

    // Version and Release Strategy
    if (needsImprovementCategories.length > 2) {
      processInitiatives.push({
        title: 'Versioning and Release Strategy',
        description: 'Implement sophisticated version management for stability',
        impact: 'Enables teams to adopt updates at their own pace',
        recommendations: [
          'Implement semantic versioning with automated changelog',
          'Create canary releases for early adopters',
          'Build migration tools and codemods',
          'Establish long-term support (LTS) versions'
        ],
        type: 'process'
      });
    }

    if (processInitiatives.length > 0) {
      themes.push({
        theme: 'Process & Governance',
        description: 'Organizational structures and workflows that ensure sustainable design system growth',
        icon: '📋',
        initiatives: processInitiatives
      });
    }

    // INNOVATION & FUTURE-PROOFING
    const innovationInitiatives: StrategicInitiative[] = [];

    // AI Integration
    if (strongCategories.length >= 2 || auditResult.overallScore > 70) {
      innovationInitiatives.push({
        title: 'AI-Powered Design System',
        description: 'Integrate AI capabilities for intelligent component suggestions',
        impact: 'Reduces development time by 50% through intelligent automation',
        recommendations: [
          'Build AI-powered component discovery and recommendation',
          'Create natural language to component translation',
          'Implement automated design-to-code generation',
          'Develop smart design token suggestions'
        ],
        type: 'innovation'
      });
    }

    // Cross-Platform Excellence
    const componentLibraryScore = auditResult.categories.find(c => c.name === 'Component Library')?.score ?? 0;
    if (componentLibraryScore > 60) {
      innovationInitiatives.push({
        title: 'Cross-Platform Design System',
        description: 'Extend design system beyond web to native and emerging platforms',
        impact: 'Enables consistent experiences across all touchpoints',
        recommendations: [
          'Create React Native component library',
          'Build design token transformers for iOS/Android',
          'Develop AR/VR component patterns',
          'Implement voice interface guidelines'
        ],
        type: 'innovation'
      });
    }

    // Open Source Leadership
    if (strongCategories.length >= 3) {
      innovationInitiatives.push({
        title: 'Open Source Contribution Strategy',
        description: 'Share innovations and establish thought leadership',
        impact: 'Builds industry reputation and attracts top talent',
        recommendations: [
          'Open source non-proprietary components',
          'Publish design system methodology and learnings',
          'Contribute to design system community standards',
          'Host design system workshops and conferences'
        ],
        type: 'innovation'
      });
    }

    if (innovationInitiatives.length > 0) {
      themes.push({
        theme: 'Innovation & Future-Proofing',
        description: 'Forward-thinking initiatives that position the design system for emerging technologies',
        icon: '🚀',
        initiatives: innovationInitiatives
      });
    }

    return themes;
  };

  const strategicThemes = generateStrategicThemes();

  const getThemeColor = (type: string) => {
    switch (type) {
      case 'architecture': return 'blue';
      case 'quality': return 'green';
      case 'process': return 'orange';
      case 'innovation': return 'purple';
      default: return 'gray';
    }
  };

  return (
    <div className="action-plan-container">
      <div className="action-plan-header">
        <Title order={2} mb="xs">Strategic Action Plan</Title>
        <Text c="dimmed" size="sm" mb="md">
          Long-term strategic initiatives to transform your design system (Score: {auditResult.overallScore}/100)
        </Text>
        <Group gap="xs" mb="xl">
          <Badge color="red" variant="light">{auditResult.categories.filter(c => c.score < 50).length} Critical Areas</Badge>
          <Badge color="orange" variant="light">{auditResult.categories.filter(c => c.score >= 50 && c.score < 70).length} Improvement Areas</Badge>
          <Badge color="yellow" variant="light">{auditResult.categories.filter(c => c.score >= 70 && c.score < 85).length} Strong Areas</Badge>
          <Badge color="green" variant="light">{auditResult.categories.filter(c => c.score >= 85).length} Excellent Areas</Badge>
        </Group>
      </div>

      <Stack gap="xl">
        {strategicThemes.map((theme, themeIndex) => (
          <div key={themeIndex} className="strategic-theme">
            <Group gap="md" mb="md">
              <Text size="xl">{theme.icon}</Text>
              <div style={{ flex: 1 }}>
                <Title order={3} mb="xs">{theme.theme}</Title>
                <Text size="sm" c="dimmed">{theme.description}</Text>
              </div>
              <Badge size="lg" variant="light" color={getThemeColor(theme.initiatives[0]?.type || 'gray')}>
                {theme.initiatives.length} strategic initiatives
              </Badge>
            </Group>
            
            <Stack gap="md">
              {theme.initiatives.map((initiative, idx) => (
                <Card key={idx} className="initiative-card" withBorder>
                  <Group justify="space-between" mb="xs">
                    <Title order={5}>{initiative.title}</Title>
                    <Group gap="xs">
                      {initiative.category && (
                        <Badge size="xs" variant="light">{initiative.category}</Badge>
                      )}
                      <Badge size="xs" color={getThemeColor(initiative.type)} variant="dot">
                        {initiative.type}
                      </Badge>
                    </Group>
                  </Group>
                  <Text size="sm" c="dimmed" mb="sm">{initiative.description}</Text>
                  
                  <Card className="impact-card" mb="md">
                    <Group gap="xs">
                      <Badge size="xs" color="green" variant="dot">Business Impact</Badge>
                      <Text size="xs">{initiative.impact}</Text>
                    </Group>
                  </Card>

                  {initiative.recommendations.length > 0 && (
                    <div>
                      <Text size="sm" fw={600} mb="xs">Key Strategies:</Text>
                      <Stack gap="xs">
                        {initiative.recommendations.map((rec, ridx) => (
                          <Group key={ridx} gap="xs" align="flex-start">
                            <Text size="xs" c="dimmed" style={{ marginTop: 2 }}>•</Text>
                            <Text size="sm" style={{ flex: 1 }}>{rec}</Text>
                          </Group>
                        ))}
                      </Stack>
                    </div>
                  )}
                </Card>
              ))}
            </Stack>
          </div>
        ))}
      </Stack>

      <Card className="methodology-note" mt="xl">
        <Group gap="xs" mb="xs">
          <Badge size="xs" color="gray">Note</Badge>
          <Text size="sm" fw={600}>About This Strategic Plan</Text>
        </Group>
        <Text size="xs" c="dimmed">
          These strategic initiatives are generated based on your audit findings and organized by theme rather than timeline.
          Unlike the Recommendations tab which lists specific issues to fix, this Action Plan focuses on larger architectural
          and process improvements that will transform your design system's long-term maintainability and effectiveness.
        </Text>
      </Card>
    </div>
  );
};


export default ActionPlan;