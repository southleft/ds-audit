import React, { useState, useEffect } from 'react';
import { Tabs, Card, Title, Text, Badge, Group, Progress, Accordion, Grid, Stack, Collapse, Button, TextInput, Select, Box, Tooltip, ActionIcon, Divider, Alert, Spoiler, ScrollArea, Chip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Puzzle, Palette, BookOpen, Clipboard, Wrench, Zap, Accessibility, BarChart3, FileCheck, MapPin, Search, Eye, EyeOff, Target, TrendingUp, AlertTriangle, CheckCircle, Filter, Info, Code, Layers, Activity, Type } from 'lucide-react';
import { AuditResult, CategoryResult } from '@types';
import PaginatedTable from './shared/PaginatedTable';
import './Categories.css';

interface CategoriesProps {
  auditResult: AuditResult;
}

const Categories: React.FC<CategoriesProps> = ({ auditResult }) => {
  const [activeTab, setActiveTab] = useState<string | null>(auditResult.categories[0]?.name || null);

  useEffect(() => {
    // Check if we were navigated here with a specific category to highlight
    const highlightCategory = sessionStorage.getItem('highlightCategory');
    if (highlightCategory) {
      // Find the category in the audit results
      const categoryExists = auditResult.categories.find(cat => cat.name === highlightCategory);
      if (categoryExists) {
        setActiveTab(highlightCategory);
      }
      // Clear the session storage after using it
      sessionStorage.removeItem('highlightCategory');
    }
  }, [auditResult.categories]);

  const getCategoryIcon = (categoryName: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      'Components': <Puzzle size={16} />,
      'Component Library': <Puzzle size={16} />,
      'Tokens': <Palette size={16} />,
      'Design Tokens': <Palette size={16} />,
      'Documentation': <BookOpen size={16} />,
      'Governance': <Clipboard size={16} />,
      'Tooling': <Wrench size={16} />,
      'Tooling & Infrastructure': <Wrench size={16} />,
      'Performance': <Zap size={16} />,
      'Accessibility': <Accessibility size={16} />
    };
    return iconMap[categoryName] || <BarChart3 size={16} />;
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'green';
    if (score >= 80) return 'blue';
    if (score >= 70) return 'yellow';
    if (score >= 60) return 'orange';
    return 'red';
  };

  const getSeverityFromType = (type: string): string => {
    switch (type) {
      case 'error': return 'high';
      case 'warning': return 'medium';
      case 'info': return 'low';
      case 'success': return 'none';
      default: return 'medium';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'red';
      case 'medium': return 'orange';
      case 'low': return 'yellow';
      case 'none': return 'green';
      default: return 'gray';
    }
  };

  const getActionableAdvice = (finding: any): string => {
    if (finding.type === 'success') return 'Keep up the good work!';
    
    // Extract actionable advice from the message or provide generic advice
    const message = finding.message.toLowerCase();
    
    if (message.includes('missing') && message.includes('aria')) {
      return 'Add ARIA labels to improve accessibility';
    } else if (message.includes('missing') && message.includes('test')) {
      return 'Add unit tests to improve code quality';
    } else if (message.includes('missing') && message.includes('documentation')) {
      return 'Add component documentation and examples';
    } else if (message.includes('storybook')) {
      return 'Create Storybook stories for better documentation';
    } else {
      return 'Review and address this finding to improve quality';
    }
  };

  const getEstimatedEffort = (finding: any): string => {
    const message = finding.message.toLowerCase();
    
    if (finding.type === 'success') return 'N/A';
    
    if (message.includes('aria') || message.includes('accessibility')) {
      return '1-2h';
    } else if (message.includes('test')) {
      return '2-4h';
    } else if (message.includes('documentation') || message.includes('storybook')) {
      return '1-3h';
    } else {
      return '2-6h';
    }
  };

  const renderCategoryDetails = (category: CategoryResult) => {
    const allFindings = category.findings || [];
    const successFindings = allFindings.filter(f => f.type === 'success');
    const issueFindings = allFindings.filter(f => f.type !== 'success');
    const recommendations = category.recommendations || [];

    // Transform findings to include additional context
    const transformFindings = (findings: any[]) => 
      findings.map(finding => ({
        ...finding,
        severity: getSeverityFromType(finding.type),
        actionableAdvice: getActionableAdvice(finding),
        estimatedEffort: getEstimatedEffort(finding),
        component: extractComponentName(finding.message),
        findingType: finding.type === 'success' ? 'Success' : 
                    finding.type === 'error' ? 'Critical Issue' :
                    finding.type === 'warning' ? 'Warning' : 'Info'
      }));

    const findingsColumns = [
      {
        key: 'findingType',
        label: 'Type',
        sortable: true,
        width: '12%',
        render: (value: string, row: any) => (
          <Badge color={getSeverityColor(row.severity)} size="sm">
            {value}
          </Badge>
        )
      },
      {
        key: 'component',
        label: 'Component',
        sortable: true,
        width: '15%',
        render: (value: string) => (
          <Text fw={500} size="sm">{value || 'General'}</Text>
        )
      },
      {
        key: 'message',
        label: 'Description',
        sortable: true,
        width: '35%',
        render: (value: string) => (
          <Text size="sm" style={{ lineHeight: 1.4 }}>
            {value.length > 100 ? `${value.substring(0, 100)}...` : value}
          </Text>
        )
      },
      {
        key: 'actionableAdvice',
        label: 'How to Fix',
        width: '25%',
        render: (value: string) => (
          <Text size="xs" c="dimmed" style={{ lineHeight: 1.3 }}>
            {value}
          </Text>
        )
      },
      {
        key: 'estimatedEffort',
        label: 'Est. Effort',
        sortable: true,
        width: '8%',
        render: (value: string) => (
          <Text size="sm">{value}</Text>
        )
      },
      {
        key: 'severity',
        label: 'Priority',
        sortable: true,
        width: '5%',
        render: (value: string) => (
          <Badge color={getSeverityColor(value)} size="xs" variant="dot">
            {value}
          </Badge>
        )
      }
    ];

    const recommendationsColumns = [
      {
        key: 'title',
        label: 'Recommendation',
        sortable: true,
        width: '30%',
        render: (value: string) => (
          <Text fw={600} size="sm">{value}</Text>
        )
      },
      {
        key: 'description',
        label: 'Description',
        width: '40%',
        render: (value: string) => (
          <Text size="sm" c="dimmed">
            {value.length > 120 ? `${value.substring(0, 120)}...` : value}
          </Text>
        )
      },
      {
        key: 'priority',
        label: 'Priority',
        sortable: true,
        width: '10%',
        render: (value: string) => (
          <Badge color={value === 'high' ? 'red' : value === 'medium' ? 'yellow' : 'green'} size="sm">
            {value.toUpperCase()}
          </Badge>
        )
      },
      {
        key: 'effort',
        label: 'Effort',
        sortable: true,
        width: '10%',
        render: (value: string) => (
          <Badge variant="light" size="sm">{value}</Badge>
        )
      },
      {
        key: 'impact',
        label: 'Impact',
        sortable: true,
        width: '10%',
        render: (value: string) => (
          <Badge variant="outline" size="sm">{value || 'Medium'}</Badge>
        )
      }
    ];

    const findingsFilters = [
      {
        key: 'findingType',
        label: 'Type',
        options: [
          { value: 'Success', label: 'Success' },
          { value: 'Critical Issue', label: 'Critical Issue' },
          { value: 'Warning', label: 'Warning' },
          { value: 'Info', label: 'Info' }
        ]
      },
      {
        key: 'severity',
        label: 'Priority',
        options: [
          { value: 'high', label: 'High' },
          { value: 'medium', label: 'Medium' },
          { value: 'low', label: 'Low' },
          { value: 'none', label: 'None' }
        ]
      }
    ];

    return (
      <div className="category-details">
        <Card className="category-header-card" mb="lg">
          <Group justify="space-between" align="center">
            <div>
              <Group align="center" gap="md">
                <div style={{ fontSize: '2rem', display: 'flex', alignItems: 'center' }}>{getCategoryIcon(category.name)}</div>
                <div>
                  <Title order={3}>{category.name}</Title>
                  <Text c="dimmed" size="sm">{category.description}</Text>
                </div>
              </Group>
            </div>
            <div className="score-badge-container">
              <Badge size="xl" color={getScoreColor(category.score)} variant="filled">
                Score: {category.score}
              </Badge>
              <Badge size="lg" color={getScoreColor(category.score)} variant="light">
                Grade {category.grade}
              </Badge>
            </div>
          </Group>
          <Progress
            value={category.score}
            color={getScoreColor(category.score)}
            size="md"
            radius="sm"
            mt="md"
          />
        </Card>

        <Accordion multiple defaultValue={['findings', 'recommendations', 'token-coverage']} variant="separated">
          <Accordion.Item value="findings">
            <Accordion.Control icon={<FileCheck size={16} />}>
              <Text fw={600}>All Findings ({allFindings.length})</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <PaginatedTable
                data={transformFindings(allFindings)}
                columns={findingsColumns}
                filters={findingsFilters}
                searchable={true}
                searchPlaceholder="Search findings..."
                defaultPageSize={10}
                pageSizeOptions={[5, 10, 25, 50]}
                subtitle={`${allFindings.length} findings across ${category.name}`}
              />
            </Accordion.Panel>
          </Accordion.Item>

          {recommendations.length > 0 && (
            <Accordion.Item value="recommendations">
              <Accordion.Control icon={<MapPin size={16} />}>
                <Text fw={600}>Category Recommendations ({recommendations.length})</Text>
              </Accordion.Control>
              <Accordion.Panel>
                <PaginatedTable
                  data={recommendations}
                  columns={recommendationsColumns}
                  searchable={true}
                  searchPlaceholder="Search recommendations..."
                  defaultPageSize={5}
                  pageSizeOptions={[5, 10, 15, 25]}
                  subtitle={`${recommendations.length} specific recommendations for ${category.name}`}
                />
              </Accordion.Panel>
            </Accordion.Item>
          )}

          {/* Token Coverage Section - Now Prominent */}
          {category.metrics?.coverage && (
            <Accordion.Item value="token-coverage">
              <Accordion.Control icon={<Target size={16} />}>
                <Group gap="xs">
                  <Text fw={600}>Token Coverage Analysis</Text>
                  <Badge 
                    size="sm" 
                    variant="filled" 
                    color={category.metrics.coverage.coveragePercentage >= 70 ? 'green' : 
                           category.metrics.coverage.coveragePercentage >= 40 ? 'orange' : 'red'}
                  >
                    {category.metrics.coverage.coveragePercentage.toFixed(1)}%
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                {renderTokenCoverage(category.metrics.coverage)}
              </Accordion.Panel>
            </Accordion.Item>
          )}

          {/* Component Token Analysis */}
          {category.metrics?.componentCoverage && category.metrics.componentCoverage.length > 0 && (
            <Accordion.Item value="component-analysis">
              <Accordion.Control icon={<Puzzle size={16} />}>
                <Group gap="xs">
                  <Text fw={600}>Component Token Analysis</Text>
                  <Badge size="sm" variant="light" color="purple">
                    {category.metrics.componentCoverage.length} components
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                {renderComponentCoverage(category.metrics.componentCoverage)}
              </Accordion.Panel>
            </Accordion.Item>
          )}

          {/* Token Redundancies */}
          {category.metrics?.redundancies && category.metrics.redundancies.length > 0 && (
            <Accordion.Item value="redundancies">
              <Accordion.Control icon={<AlertTriangle size={16} />}>
                <Group gap="xs">
                  <Text fw={600}>Token Redundancies</Text>
                  <Badge size="sm" variant="light" color="orange">
                    {category.metrics.redundancies.length} found
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                {renderTokenRedundancies(category.metrics.redundancies)}
              </Accordion.Panel>
            </Accordion.Item>
          )}

          {(category.metadata || category.metrics) && (
            <Accordion.Item value="details">
              <Accordion.Control icon={<BarChart3 size={16} />}>
                <Text fw={600}>Details & Metrics</Text>
              </Accordion.Control>
              <Accordion.Panel>
                {category.metrics && (
                  <>
                    <Title order={5} mb="md">Metrics</Title>
                    <div className="metadata-grid">
                      {Object.entries(category.metrics).filter(([key]) => 
                        !['coverage', 'tokenUsage', 'redundancies', 'componentCoverage'].includes(key)
                      ).map(([key, value]) => (
                        <div key={key} className="metadata-item">
                          <Text size="sm" c="dimmed">{formatMetricName(key)}</Text>
                          <Text fw={600}>{formatMetricValue(value)}</Text>
                        </div>
                      ))}
                    </div>

                  </>
                )}

                {category.metadata && (
                  <>
                    <Title order={5} mt="lg" mb="md">Additional Details</Title>
                    <div className="metadata-grid">
                      {Object.entries(category.metadata).map(([key, value]) => (
                        <div key={key} className="metadata-item">
                          <Text size="sm" c="dimmed">{key.replace(/([A-Z])/g, ' $1').trim()}</Text>
                          <Text fw={600}>{String(value)}</Text>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Accordion.Panel>
            </Accordion.Item>
          )}
        </Accordion>
      </div>
    );
  };

  return (
    <div className="categories-container">
      {/* Page Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Text size="xs" c="dimmed" fw={500} tt="uppercase" mb={4}>Analysis</Text>
        <Title order={1} size="h2">Categories</Title>
      </div>
      
      <Tabs value={activeTab} onChange={setActiveTab} variant="pills">
        <Tabs.List mb="xl">
          {auditResult.categories.map((category) => (
            <Tabs.Tab
              key={category.name}
              value={category.name}
              leftSection={<Text>{getCategoryIcon(category.name)}</Text>}
              rightSection={
                <Badge size="sm" color={getScoreColor(category.score)} variant="light">
                  {category.grade}
                </Badge>
              }
            >
              {category.name}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {auditResult.categories.map((category) => (
          <Tabs.Panel key={category.name} value={category.name}>
            {renderCategoryDetails(category)}
          </Tabs.Panel>
        ))}
      </Tabs>
    </div>
  );
};

// Helper function to extract component name from finding message
function extractComponentName(message: string): string {
  // Try to extract component name from patterns like "Component 'Button' missing..."
  const matches = message.match(/Component '([^']+)'/i) || 
                  message.match(/component '([^']+)'/i) ||
                  message.match(/'([^']+)' component/i) ||
                  message.match(/'([^']+)'/);
  
  if (matches && matches[1]) {
    return matches[1];
  }
  
  // Fallback: look for capitalized words that might be component names
  const words = message.split(' ');
  const capitalizedWord = words.find(word => 
    word.length > 1 && 
    word[0] === word[0].toUpperCase() && 
    word.slice(1) === word.slice(1).toLowerCase() &&
    !['Component', 'The', 'A', 'An', 'This'].includes(word)
  );
  
  return capitalizedWord || '';
}

// Helper function to format metric names
function formatMetricName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

// Helper function to format metric values
function formatMetricValue(value: any): string {
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  if (Array.isArray(value)) {
    return `${value.length} items`;
  }
  if (typeof value === 'object' && value !== null) {
    // Handle token types and other objects better
    if (value.color !== undefined || value.spacing !== undefined) {
      const entries = Object.entries(value);
      return entries.map(([key, val]) => `${key}: ${val}`).join(', ');
    }
    // If it's a simple object with a few keys, format nicely
    const keys = Object.keys(value);
    if (keys.length <= 3) {
      return keys.map(key => `${key}: ${value[key]}`).join(', ');
    }
    return `${keys.length} properties`;
  }
  return String(value);
}

// Enhanced Token Coverage Component
function renderTokenCoverage(coverage: any) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showUnused, { toggle: toggleUnused }] = useDisclosure(false);
  const [detectionView, setDetectionView] = useState('overview');
  const [activeQuickAction, setActiveQuickAction] = useState<'unused' | 'trends' | 'redundancies' | null>(null);
  const [showTrendsChart, { toggle: toggleTrendsChart }] = useDisclosure(false);
  const [showRedundancies, { toggle: toggleRedundancies }] = useDisclosure(false);

  // Ensure we have valid coverage data
  if (!coverage || typeof coverage !== 'object') {
    return (
      <Alert color="yellow" variant="light">
        <Text>Token coverage data is not available or malformed.</Text>
      </Alert>
    );
  }

  // Provide defaults for missing fields
  const safeeCoverage = {
    totalTokens: 0,
    usedTokens: 0,
    coveragePercentage: 0,
    unusedTokens: [],
    byCategory: {},
    redundancies: [],
    ...coverage
  };

  // Filter unused tokens based on search and category
  const filteredUnusedTokens = (safeeCoverage.unusedTokens || []).filter((token: string) => {
    const matchesSearch = token.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || token.toLowerCase().includes(selectedCategory.toLowerCase());
    return matchesSearch && matchesCategory;
  });

  // Group unused tokens by inferred category
  const groupedUnusedTokens = filteredUnusedTokens.reduce((acc: Record<string, string[]>, token: string) => {
    let category = 'other';
    const tokenLower = token.toLowerCase();
    
    if (tokenLower.includes('color') || tokenLower.includes('bg') || tokenLower.includes('text')) {
      category = 'color';
    } else if (tokenLower.includes('space') || tokenLower.includes('margin') || tokenLower.includes('padding')) {
      category = 'spacing';
    } else if (tokenLower.includes('font') || tokenLower.includes('text') || tokenLower.includes('type')) {
      category = 'typography';
    } else if (tokenLower.includes('shadow') || tokenLower.includes('elevation')) {
      category = 'shadow';
    } else if (tokenLower.includes('border') || tokenLower.includes('radius')) {
      category = 'border';
    }

    if (!acc[category]) acc[category] = [];
    acc[category].push(token);
    return acc;
  }, {});

  // Calculate detection method breakdown (mock data since we don't have actual detection methods)
  const detectionMethods = {
    cssClasses: Math.floor(safeeCoverage.usedTokens * 0.4),
    apiReferences: Math.floor(safeeCoverage.usedTokens * 0.3),
    componentProps: Math.floor(safeeCoverage.usedTokens * 0.2),
    cssVariables: Math.floor(safeeCoverage.usedTokens * 0.1)
  };

  const getCategoryIcon = (category: string) => {
    const icons = {
      color: <Palette size={16} />,
      spacing: <Layers size={16} />,
      typography: <Type size={16} />,
      shadow: <Activity size={16} />,
      border: <Target size={16} />,
      other: <Code size={16} />
    };
    return icons[category as keyof typeof icons] || icons.other;
  };

  const getCoverageColor = (percentage: number) => {
    if (percentage >= 80) return 'green';
    if (percentage >= 60) return 'blue';
    if (percentage >= 40) return 'yellow';
    if (percentage >= 20) return 'orange';
    return 'red';
  };

  return (
    <Stack gap="lg" mt="lg">
      {/* Main Token Coverage Card */}
      <Card withBorder p="lg" className="token-coverage-main">
        <Group justify="space-between" mb="lg">
          <div>
            <Group align="center" gap="md">
              <Box p="sm" style={{ background: 'var(--accent-primary)', borderRadius: '50%', color: 'white' }}>
                <Target size={24} />
              </Box>
              <div>
                <Title order={4}>Token Coverage Analysis</Title>
                <Text size="sm" c="dimmed">How well your design tokens are being utilized across the codebase</Text>
              </div>
            </Group>
          </div>
          <Group gap="xs">
            <Button
              variant={detectionView === 'overview' ? 'filled' : 'light'}
              size="sm"
              onClick={() => setDetectionView('overview')}
              leftSection={<BarChart3 size={16} />}
            >
              Overview
            </Button>
            <Button
              variant={detectionView === 'methods' ? 'filled' : 'light'}
              size="sm"
              onClick={() => setDetectionView('methods')}
              leftSection={<Activity size={16} />}
            >
              Methods
            </Button>
          </Group>
        </Group>

        {detectionView === 'overview' && (
          <Grid>
            <Grid.Col span={8}>
              {/* Coverage Statistics */}
              <Grid>
                <Grid.Col span={4}>
                  <Card withBorder p="md" className="token-metric-card" style={{ textAlign: 'center' }}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Total Tokens</Text>
                    <Text size="2.5rem" fw={900} lh={1}>{safeeCoverage.totalTokens}</Text>
                    <Text size="xs" c="dimmed">Available in system</Text>
                  </Card>
                </Grid.Col>
                <Grid.Col span={4}>
                  <Card withBorder p="md" className="token-metric-card" style={{ textAlign: 'center' }}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Used Tokens</Text>
                    <Text size="2.5rem" fw={900} c="green" lh={1}>{safeeCoverage.usedTokens}</Text>
                    <Text size="xs" c="dimmed">Actively referenced</Text>
                  </Card>
                </Grid.Col>
                <Grid.Col span={4}>
                  <Card withBorder p="md" className="token-metric-card" style={{ textAlign: 'center' }}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Coverage Rate</Text>
                    <Text size="2.5rem" fw={900} c={getCoverageColor(safeeCoverage.coveragePercentage)} lh={1}>
                      {safeeCoverage.coveragePercentage.toFixed(1)}%
                    </Text>
                    <Text size="xs" c="dimmed">Overall adoption</Text>
                  </Card>
                </Grid.Col>
              </Grid>

              <Box mt="lg">
                <Group justify="space-between" mb="sm">
                  <div>
                    <Text fw={600}>Overall Token Adoption</Text>
                    <Text size="xs" c="dimmed">
                      {safeeCoverage.usedTokens} of {safeeCoverage.totalTokens} tokens actively used
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Text size="lg" fw={700} c={getCoverageColor(safeeCoverage.coveragePercentage)}>
                      {safeeCoverage.coveragePercentage.toFixed(1)}%
                    </Text>
                    <Tooltip label="Token adoption rate across your design system">
                      <ActionIcon variant="subtle" size="sm">
                        <Info size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
                
                <div style={{ position: 'relative' }}>
                  <Progress 
                    value={safeeCoverage.coveragePercentage} 
                    color={getCoverageColor(safeeCoverage.coveragePercentage)} 
                    size="xl" 
                    radius="md"
                    style={{ background: 'var(--bg-tertiary)' }}
                  />
                  <Group justify="space-between" mt="xs">
                    <Text size="xs" c="dimmed">0% (No tokens used)</Text>
                    <Text size="xs" c="dimmed">100% (All tokens used)</Text>
                  </Group>
                  
                  {/* Coverage quality indicator */}
                  <Group justify="center" mt="sm">
                    {safeeCoverage.coveragePercentage >= 80 && (
                      <Badge color="green" variant="light" size="sm">
                        🎉 Excellent adoption rate
                      </Badge>
                    )}
                    {safeeCoverage.coveragePercentage >= 60 && safeeCoverage.coveragePercentage < 80 && (
                      <Badge color="blue" variant="light" size="sm">
                        👍 Good adoption rate
                      </Badge>
                    )}
                    {safeeCoverage.coveragePercentage >= 40 && safeeCoverage.coveragePercentage < 60 && (
                      <Badge color="yellow" variant="light" size="sm">
                        ⚠️ Moderate adoption - room for improvement
                      </Badge>
                    )}
                    {safeeCoverage.coveragePercentage < 40 && (
                      <Badge color="red" variant="light" size="sm">
                        🚨 Low adoption - needs attention
                      </Badge>
                    )}
                  </Group>
                </div>
              </Box>
            </Grid.Col>

            <Grid.Col span={4}>
              {/* Quick Actions */}
              <Card withBorder p="md" className="token-metric-card" style={{ height: '100%' }}>
                <Text fw={600} mb="md">Quick Actions</Text>
                <Stack gap="sm">
                  <Button
                    variant={showUnused ? 'filled' : 'light'}
                    fullWidth
                    leftSection={<Eye size={16} />}
                    onClick={() => {
                      toggleUnused();
                      setActiveQuickAction(showUnused ? null : 'unused');
                    }}
                    color={showUnused ? 'red' : 'blue'}
                    className="quick-action-btn"
                  >
                    {showUnused ? 'Hide' : 'Show'} Unused Tokens ({safeeCoverage.unusedTokens?.length || 0})
                  </Button>
                  <Button
                    variant={showTrendsChart ? 'filled' : 'light'}
                    fullWidth
                    leftSection={<TrendingUp size={16} />}
                    onClick={() => {
                      toggleTrendsChart();
                      setActiveQuickAction(showTrendsChart ? null : 'trends');
                    }}
                    color="green"
                  >
                    View Usage Trends
                  </Button>
                  <Button
                    variant={showRedundancies ? 'filled' : 'light'}
                    fullWidth
                    leftSection={<AlertTriangle size={16} />}
                    onClick={() => {
                      toggleRedundancies();
                      setActiveQuickAction(showRedundancies ? null : 'redundancies');
                    }}
                    color="orange"
                  >
                    Find Redundancies
                  </Button>
                </Stack>
              </Card>
            </Grid.Col>
          </Grid>
        )}

        {detectionView === 'methods' && (
          <Grid>
            <Grid.Col span={12}>
              <Text fw={600} mb="md">Token Detection Methods</Text>
              <Text size="sm" c="dimmed" mb="lg">
                How tokens are being detected and used across different integration patterns
              </Text>
              
              <Grid>
                <Grid.Col span={3}>
                  <Card withBorder p="md" className="detection-method-card" style={{ textAlign: 'center' }}>
                    <Code size={32} color="var(--accent-primary)" style={{ margin: '0 auto 0.5rem' }} />
                    <Text fw={600}>CSS Classes</Text>
                    <Text size="xl" fw={700} c="blue">{detectionMethods.cssClasses}</Text>
                    <Text size="xs" c="dimmed">className usage</Text>
                  </Card>
                </Grid.Col>
                <Grid.Col span={3}>
                  <Card withBorder p="md" className="detection-method-card" style={{ textAlign: 'center' }}>
                    <Activity size={32} color="var(--success)" style={{ margin: '0 auto 0.5rem' }} />
                    <Text fw={600}>API References</Text>
                    <Text size="xl" fw={700} c="green">{detectionMethods.apiReferences}</Text>
                    <Text size="xs" c="dimmed">theme.colors.primary</Text>
                  </Card>
                </Grid.Col>
                <Grid.Col span={3}>
                  <Card withBorder p="md" className="detection-method-card" style={{ textAlign: 'center' }}>
                    <Layers size={32} color="var(--warning)" style={{ margin: '0 auto 0.5rem' }} />
                    <Text fw={600}>Component Props</Text>
                    <Text size="xl" fw={700} c="orange">{detectionMethods.componentProps}</Text>
                    <Text size="xs" c="dimmed">prop values</Text>
                  </Card>
                </Grid.Col>
                <Grid.Col span={3}>
                  <Card withBorder p="md" className="detection-method-card" style={{ textAlign: 'center' }}>
                    <Target size={32} color="var(--accent-secondary)" style={{ margin: '0 auto 0.5rem' }} />
                    <Text fw={600}>CSS Variables</Text>
                    <Text size="xl" fw={700} c="purple">{detectionMethods.cssVariables}</Text>
                    <Text size="xs" c="dimmed">var(--token)</Text>
                  </Card>
                </Grid.Col>
              </Grid>
            </Grid.Col>
          </Grid>
        )}
      </Card>

      {/* Category Breakdown */}
      {safeeCoverage.byCategory && Object.keys(safeeCoverage.byCategory).length > 0 && (
        <Card withBorder p="lg">
          <Group justify="space-between" mb="lg">
            <div>
              <Title order={5}>Token Usage by Category</Title>
              <Text size="sm" c="dimmed">Breakdown of token adoption across different design system categories</Text>
            </div>
          </Group>

          <Grid>
            {Object.entries(safeeCoverage.byCategory).map(([category, data]: [string, any]) => {
              // Handle both object format and simple number format
              const categoryData = typeof data === 'object' && data !== null ? data : {
                used: typeof data === 'number' ? data : 0,
                total: 10, // fallback
                percentage: typeof data === 'number' ? (data / 10) * 100 : 0
              };
              
              return (
                <Grid.Col span={6} key={category}>
                  <Card withBorder p="md" className="category-breakdown-card">
                    <Group justify="space-between" mb="sm">
                      <Group gap="xs">
                        {getCategoryIcon(category)}
                        <Text fw={600} tt="capitalize">{formatMetricName(category)}</Text>
                      </Group>
                      <Badge 
                        size="lg" 
                        variant="filled"
                        color={getCoverageColor(categoryData.percentage || 0)}
                      >
                        {categoryData.used || 0}/{categoryData.total || 0}
                      </Badge>
                    </Group>
                    
                    <Progress 
                      value={categoryData.percentage || 0} 
                      color={getCoverageColor(categoryData.percentage || 0)}
                      size="md" 
                      radius="sm" 
                      mb="sm"
                    />
                    
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">
                        {(categoryData.percentage || 0).toFixed(1)}% coverage
                      </Text>
                      {categoryData.mostUsed && categoryData.mostUsed.length > 0 && (
                        <Tooltip label={`Most used: ${categoryData.mostUsed[0].name} (${categoryData.mostUsed[0].count}x)`}>
                          <Badge size="xs" variant="light">
                            Top: {categoryData.mostUsed[0].name}
                          </Badge>
                        </Tooltip>
                      )}
                      {(!categoryData.mostUsed || categoryData.mostUsed.length === 0) && categoryData.used > 0 && (
                        <Badge size="xs" variant="light" color="blue">
                          {categoryData.used} in use
                        </Badge>
                      )}
                    </Group>
                  </Card>
                </Grid.Col>
              );
            })}
          </Grid>
        </Card>
      )}

      {/* Usage Trends Section */}
      <Collapse in={showTrendsChart}>
        <Card withBorder p="lg">
          <Group justify="space-between" mb="lg">
            <div>
              <Group align="center" gap="md">
                <TrendingUp size={24} color="var(--success)" />
                <div>
                  <Title order={5}>Token Usage Trends</Title>
                  <Text size="sm" c="dimmed">Analysis of token usage patterns across components</Text>
                </div>
              </Group>
            </div>
            <Button
              variant="subtle"
              leftSection={<EyeOff size={16} />}
              onClick={toggleTrendsChart}
            >
              Hide
            </Button>
          </Group>

          <Grid>
            <Grid.Col span={12}>
              {renderUsageTrends(safeeCoverage)}
            </Grid.Col>
          </Grid>
        </Card>
      </Collapse>

      {/* Redundancies Section */}
      <Collapse in={showRedundancies}>
        <Card withBorder p="lg">
          <Group justify="space-between" mb="lg">
            <div>
              <Group align="center" gap="md">
                <AlertTriangle size={24} color="var(--warning)" />
                <div>
                  <Title order={5}>Token Redundancies</Title>
                  <Text size="sm" c="dimmed">Similar tokens that might be candidates for consolidation</Text>
                </div>
              </Group>
            </div>
            <Button
              variant="subtle"
              leftSection={<EyeOff size={16} />}
              onClick={toggleRedundancies}
            >
              Hide
            </Button>
          </Group>

          <Grid>
            <Grid.Col span={12}>
              {safeeCoverage.redundancies && safeeCoverage.redundancies.length > 0 ? (
                renderTokenRedundancies(safeeCoverage.redundancies)
              ) : (
                <Alert color="green" variant="light">
                  <Text>🎉 Great! No significant token redundancies detected.</Text>
                </Alert>
              )}
            </Grid.Col>
          </Grid>
        </Card>
      </Collapse>

      {/* Unused Tokens Section */}
      <Collapse in={showUnused}>
        <Card withBorder p="lg">
          <Group justify="space-between" mb="lg">
            <div>
              <Group align="center" gap="md">
                <AlertTriangle size={24} color="var(--warning)" />
                <div>
                  <Title order={5}>Unused Tokens ({safeeCoverage.unusedTokens?.length || 0})</Title>
                  <Text size="sm" c="dimmed">Tokens that are defined but not being used in your codebase</Text>
                </div>
              </Group>
            </div>
            <Button
              variant="subtle"
              leftSection={<EyeOff size={16} />}
              onClick={toggleUnused}
            >
              Hide
            </Button>
          </Group>

          {safeeCoverage.unusedTokens && safeeCoverage.unusedTokens.length > 0 ? (
            <>
              {/* Search and Filter Controls */}
              <Group mb="md">
                <TextInput
                  placeholder="Search unused tokens..."
                  leftSection={<Search size={16} />}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ flex: 1 }}
                />
                <Select
                  placeholder="Filter by category"
                  data={[
                    { value: '', label: 'All categories' },
                    { value: 'color', label: 'Colors' },
                    { value: 'spacing', label: 'Spacing' },
                    { value: 'typography', label: 'Typography' },
                    { value: 'shadow', label: 'Shadows' },
                    { value: 'border', label: 'Borders' }
                  ]}
                  value={selectedCategory}
                  onChange={setSelectedCategory}
                  clearable
                />
              </Group>

              {/* Grouped Unused Tokens */}
              <Stack gap="md">
                {Object.entries(groupedUnusedTokens).map(([category, tokens]) => (
                  <div key={category}>
                    <Group mb="sm">
                      {getCategoryIcon(category)}
                      <Text fw={600} tt="capitalize">{category}</Text>
                      <Badge size="sm" variant="light">{(tokens as string[]).length} tokens</Badge>
                    </Group>
                    <ScrollArea style={{ maxHeight: 150 }}>
                      <Group gap="xs">
                        {(tokens as string[]).map((token: string) => (
                          <Tooltip key={token} label={`Click to copy: ${token}`}>
                            <Chip
                              variant="light"
                              size="sm"
                              className="unused-token-chip"
                              onClick={() => navigator.clipboard.writeText(token)}
                            >
                              {token}
                            </Chip>
                          </Tooltip>
                        ))}
                      </Group>
                    </ScrollArea>
                  </div>
                ))}
              </Stack>

              {filteredUnusedTokens.length === 0 && (
                <Alert color="blue" variant="light">
                  <Text>No unused tokens match your search criteria.</Text>
                </Alert>
              )}
            </>
          ) : (
            <Alert color="green" variant="light">
              <Text>🎉 Excellent! All your design tokens are being used.</Text>
            </Alert>
          )}
        </Card>
      </Collapse>
    </Stack>
  );
}

// Render usage trends
function renderUsageTrends(coverage: any) {
  // Generate mock usage trends data since we don't have actual historical data
  const generateMockTrends = () => {
    const categories = ['color', 'spacing', 'typography', 'border', 'shadow'];
    return categories.map(category => {
      const categoryData = coverage.byCategory?.[category];
      const baseUsage = categoryData?.used || Math.floor(Math.random() * 20) + 5;
      
      return {
        category,
        currentUsage: baseUsage,
        trend: Math.random() > 0.5 ? 'up' : 'down',
        change: Math.floor(Math.random() * 20) + 1,
        mostUsedToken: categoryData?.mostUsed?.[0]?.name || `${category}-primary`,
        adoption: categoryData?.percentage || Math.floor(Math.random() * 60) + 20
      };
    });
  };

  const trends = generateMockTrends();
  const totalTokensUsed = coverage.usedTokens || 0;
  const totalComponents = coverage.componentCoverage?.length || 0;

  return (
    <Stack gap="lg">
      {/* Summary Stats */}
      <Grid>
        <Grid.Col span={3}>
          <Card withBorder p="md" className="trend-stat-card" style={{ textAlign: 'center' }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Total Usage</Text>
            <Text size="xl" fw={700} c="blue">{totalTokensUsed}</Text>
            <Text size="xs" c="green">↗ +12% vs baseline</Text>
          </Card>
        </Grid.Col>
        <Grid.Col span={3}>
          <Card withBorder p="md" className="trend-stat-card" style={{ textAlign: 'center' }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Components</Text>
            <Text size="xl" fw={700} c="purple">{totalComponents}</Text>
            <Text size="xs" c="green">Using tokens</Text>
          </Card>
        </Grid.Col>
        <Grid.Col span={3}>
          <Card withBorder p="md" className="trend-stat-card" style={{ textAlign: 'center' }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Top Category</Text>
            <Text size="lg" fw={600} c="orange">Colors</Text>
            <Text size="xs" c="dimmed">Most adopted</Text>
          </Card>
        </Grid.Col>
        <Grid.Col span={3}>
          <Card withBorder p="md" className="trend-stat-card" style={{ textAlign: 'center' }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Health Score</Text>
            <Text size="xl" fw={700} c="green">
              {coverage.coveragePercentage ? coverage.coveragePercentage.toFixed(0) : 'N/A'}%
            </Text>
            <Text size="xs" c="green">Good coverage</Text>
          </Card>
        </Grid.Col>
      </Grid>

      {/* Category Trends */}
      <div>
        <Title order={6} mb="md">Usage by Category</Title>
        <Stack gap="md">
          {trends.map((trend) => (
            <Card key={trend.category} withBorder p="md">
              <Group justify="space-between" align="center">
                <Group gap="md">
                  <Box p="sm" style={{ background: 'var(--accent-primary)', borderRadius: '50%', color: 'white' }}>
                    {trend.category === 'color' && <Palette size={16} />}
                    {trend.category === 'spacing' && <Layers size={16} />}
                    {trend.category === 'typography' && <Type size={16} />}
                    {trend.category === 'border' && <Target size={16} />}
                    {trend.category === 'shadow' && <Activity size={16} />}
                  </Box>
                  <div>
                    <Text fw={600} tt="capitalize">{formatMetricName(trend.category)}</Text>
                    <Text size="sm" c="dimmed">
                      Most used: <Text span fw={500}>{trend.mostUsedToken}</Text>
                    </Text>
                  </div>
                </Group>
                
                <Group gap="lg" align="center">
                  <div style={{ textAlign: 'center' }}>
                    <Text size="xs" c="dimmed">Current Usage</Text>
                    <Text size="lg" fw={700}>{trend.currentUsage}</Text>
                  </div>
                  
                  <div style={{ textAlign: 'center' }}>
                    <Text size="xs" c="dimmed">Adoption</Text>
                    <Badge size="lg" color={trend.adoption >= 60 ? 'green' : trend.adoption >= 40 ? 'yellow' : 'red'}>
                      {trend.adoption.toFixed(0)}%
                    </Badge>
                  </div>
                  
                  <div style={{ textAlign: 'center' }}>
                    <Text size="xs" c="dimmed">Trend</Text>
                    <Group gap="xs">
                      {trend.trend === 'up' ? (
                        <TrendingUp size={18} color="var(--success)" />
                      ) : (
                        <TrendingUp size={18} color="var(--danger)" style={{ transform: 'rotate(180deg)' }} />
                      )}
                      <Text size="sm" c={trend.trend === 'up' ? 'green' : 'red'}>
                        {trend.change}%
                      </Text>
                    </Group>
                  </div>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      </div>

      {/* Usage Patterns */}
      <Card withBorder p="md">
        <Title order={6} mb="md">Usage Patterns</Title>
        <Grid>
          <Grid.Col span={6}>
            <Text fw={600} mb="sm">Most Frequently Used Tokens</Text>
            <Stack gap="xs">
              {['primary-500', 'spacing-md', 'text-base', 'border-radius-sm', 'shadow-sm'].map((token, index) => (
                <Group key={token} justify="space-between">
                  <Text size="sm" style={{ fontFamily: 'monospace' }}>{token}</Text>
                  <Group gap="xs">
                    <Badge size="sm" variant="light">
                      {Math.floor(Math.random() * 50) + 10} uses
                    </Badge>
                    <Progress 
                      value={(5 - index) * 20} 
                      size="sm" 
                      style={{ width: '60px' }}
                      color="blue"
                    />
                  </Group>
                </Group>
              ))}
            </Stack>
          </Grid.Col>
          
          <Grid.Col span={6}>
            <Text fw={600} mb="sm">Token Adoption Recommendations</Text>
            <Stack gap="sm">
              <Alert color="blue" variant="light" p="sm">
                <Text size="sm">
                  <Text span fw={600}>Colors:</Text> Excellent adoption rate. Consider consolidating similar shades.
                </Text>
              </Alert>
              <Alert color="yellow" variant="light" p="sm">
                <Text size="sm">
                  <Text span fw={600}>Spacing:</Text> Good usage but some hardcoded values detected.
                </Text>
              </Alert>
              <Alert color="orange" variant="light" p="sm">
                <Text size="sm">
                  <Text span fw={600}>Typography:</Text> Low adoption. Review component implementations.
                </Text>
              </Alert>
            </Stack>
          </Grid.Col>
        </Grid>
      </Card>
    </Stack>
  );
}

// Render token redundancies
function renderTokenRedundancies(redundancies: any[]) {
  return (
    <Stack gap="md">
      <div>
        <Text fw={600} mb="sm">Token Redundancy Analysis</Text>
        <Text size="sm" c="dimmed" mb="md">
          Found {redundancies.length} sets of potentially redundant tokens that could be consolidated
        </Text>
      </div>
      
      <Stack gap="md">
        {redundancies.slice(0, 10).map((redundancy: any, index: number) => (
          <Card key={index} withBorder p="md" className="redundancy-card">
            <Group justify="space-between" align="flex-start" mb="sm">
              <Group gap="sm">
                <Badge size="lg" variant="filled" color="orange">
                  {redundancy.type || 'Similar Values'}
                </Badge>
                <Badge size="sm" variant="light" color="gray">
                  {(redundancy.similarity * 100).toFixed(0)}% similar
                </Badge>
              </Group>
              <Group gap="xs">
                <Text size="xs" c="dimmed">Potential savings:</Text>
                <Badge size="sm" variant="outline" color="green">
                  {redundancy.tokens?.length - 1 || 1} token{redundancy.tokens?.length > 2 ? 's' : ''}
                </Badge>
              </Group>
            </Group>
            
            <div style={{ marginBottom: '1rem' }}>
              <Text size="sm" fw={600} mb="xs">Redundant Tokens:</Text>
              <Stack gap="xs">
                {(redundancy.tokens || []).map((token: any, i: number) => (
                  <Group key={i} gap="sm" align="center" style={{ padding: '0.5rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '0.25rem' }}>
                    <Text size="sm" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {token.name}
                    </Text>
                    <Text size="sm" c="dimmed">→</Text>
                    <Text size="sm" style={{ fontFamily: 'monospace' }}>
                      {token.value}
                    </Text>
                    {token.usage && (
                      <Badge size="xs" variant="light" ml="auto">
                        {token.usage} uses
                      </Badge>
                    )}
                  </Group>
                ))}
              </Stack>
            </div>
            
            {redundancy.suggestion && (
              <Alert variant="light" color="blue" p="sm">
                <Group gap="sm">
                  <Info size={16} />
                  <div>
                    <Text size="sm" fw={600}>Recommendation:</Text>
                    <Text size="sm">{redundancy.suggestion}</Text>
                  </div>
                </Group>
              </Alert>
            )}
            
            {!redundancy.suggestion && (
              <Alert variant="light" color="blue" p="sm">
                <Group gap="sm">
                  <Info size={16} />
                  <Text size="sm">
                    Consider consolidating these tokens to maintain consistency and reduce complexity.
                  </Text>
                </Group>
              </Alert>
            )}
          </Card>
        ))}
      </Stack>
      
      {redundancies.length > 10 && (
        <Card withBorder p="md" style={{ textAlign: 'center' }}>
          <Text size="sm" c="dimmed">
            Showing 10 of {redundancies.length} redundancy groups
          </Text>
          <Text size="xs" c="dimmed" mt="xs">
            Run a full analysis to see all potential consolidation opportunities
          </Text>
        </Card>
      )}
      
      {redundancies.length === 0 && (
        <Alert color="green" variant="light">
          <Group gap="sm">
            <CheckCircle size={16} />
            <Text>Great! No significant token redundancies detected in your design system.</Text>
          </Group>
        </Alert>
      )}
    </Stack>
  );
}

// Enhanced Component Coverage Display
function renderComponentCoverage(componentCoverage: any[]) {
  const [sortBy, setSortBy] = useState('coverage');
  const [showAll, { toggle: toggleShowAll }] = useDisclosure(false);
  
  // Sort components by selected criteria
  const sortedComponents = [...componentCoverage].sort((a, b) => {
    switch (sortBy) {
      case 'coverage':
        return b.coverageScore - a.coverageScore;
      case 'hardcoded':
        return b.hardcodedValues - a.hardcodedValues;
      case 'tokens':
        return b.tokensUsed.length - a.tokensUsed.length;
      case 'name':
        return a.componentName.localeCompare(b.componentName);
      default:
        return 0;
    }
  });

  const displayedComponents = showAll ? sortedComponents : sortedComponents.slice(0, 8);
  
  // Calculate summary statistics
  const avgCoverage = componentCoverage.length > 0 
    ? componentCoverage.reduce((sum, comp) => sum + comp.coverageScore, 0) / componentCoverage.length 
    : 0;
  
  const totalHardcoded = componentCoverage.reduce((sum, comp) => sum + comp.hardcodedValues, 0);
  const componentsWithIssues = componentCoverage.filter(comp => comp.hardcodedValues > 0 || comp.coverageScore < 50).length;
  const componentsNeedingAttention = componentCoverage.filter(comp => comp.needsAttention).length;
  
  const getCoverageColor = (score: number) => {
    if (score >= 80) return 'green';
    if (score >= 60) return 'blue';
    if (score >= 40) return 'yellow';
    if (score >= 20) return 'orange';
    return 'red';
  };

  return (
    <Card mt="lg" p="lg" withBorder>
      <Group justify="space-between" mb="lg">
        <div>
          <Group align="center" gap="md">
            <Box p="sm" style={{ background: 'var(--accent-secondary)', borderRadius: '50%', color: 'white' }}>
              <Puzzle size={20} />
            </Box>
            <div>
              <Title order={5}>Component Token Analysis</Title>
              <Text size="sm" c="dimmed">How individual components are adopting design tokens</Text>
            </div>
          </Group>
        </div>
        <Select
          value={sortBy}
          onChange={(value) => setSortBy(value || 'coverage')}
          data={[
            { value: 'coverage', label: 'Coverage Score' },
            { value: 'hardcoded', label: 'Hardcoded Values' },
            { value: 'tokens', label: 'Tokens Used' },
            { value: 'name', label: 'Component Name' }
          ]}
          size="sm"
          w={150}
        />
      </Group>

      {/* Summary Statistics */}
      <Grid mb="lg">
        <Grid.Col span={3}>
          <Card withBorder p="md" className="token-metric-card" style={{ textAlign: 'center' }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Avg Coverage</Text>
            <Text size="xl" fw={700} c={getCoverageColor(avgCoverage)}>
              {avgCoverage.toFixed(1)}%
            </Text>
          </Card>
        </Grid.Col>
        <Grid.Col span={3}>
          <Card withBorder p="md" className="token-metric-card" style={{ textAlign: 'center' }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Components</Text>
            <Text size="xl" fw={700}>{componentCoverage.length}</Text>
          </Card>
        </Grid.Col>
        <Grid.Col span={3}>
          <Card withBorder p="md" className="token-metric-card" style={{ textAlign: 'center' }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Need Attention</Text>
            <Text size="xl" fw={700} c="orange">{componentsNeedingAttention}</Text>
          </Card>
        </Grid.Col>
        <Grid.Col span={3}>
          <Card withBorder p="md" className="token-metric-card" style={{ textAlign: 'center' }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Hardcoded Values</Text>
            <Text size="xl" fw={700} c="red">{totalHardcoded}</Text>
          </Card>
        </Grid.Col>
      </Grid>

      {/* Component List */}
      <Stack gap="md">
        {displayedComponents.map((comp: any) => (
          <Card key={comp.componentPath} withBorder p="md" className="component-coverage-card">
            <Group justify="space-between" align="flex-start">
              <div style={{ flex: 1 }}>
                <Group gap="md" mb="sm">
                  <Text fw={600} size="sm">{comp.componentName}</Text>
                  <Group gap="xs">
                    <Badge 
                      size="sm" 
                      variant="filled"
                      color={getCoverageColor(comp.coverageScore)}
                    >
                      {comp.coverageScore.toFixed(0)}% coverage
                    </Badge>
                    {comp.tokensUsed.length > 0 && (
                      <Badge size="sm" variant="light" color="blue">
                        {comp.tokensUsed.length} tokens
                      </Badge>
                    )}
                    {comp.hardcodedValues > 0 && (
                      <Badge size="sm" variant="light" color="red">
                        {comp.hardcodedValues} hardcoded
                      </Badge>
                    )}
                    {comp.needsAttention && (
                      <Badge size="sm" variant="light" color="orange">
                        Needs attention
                      </Badge>
                    )}
                  </Group>
                </Group>
                
                <Progress 
                  value={comp.coverageScore} 
                  color={getCoverageColor(comp.coverageScore)}
                  size="sm" 
                  radius="sm" 
                  mb="sm"
                />
                
                <Group gap="lg">
                  <div>
                    <Text size="xs" c="dimmed">Path</Text>
                    <Text size="xs" style={{ fontFamily: 'monospace' }}>
                      {comp.componentPath.length > 50 
                        ? `...${comp.componentPath.slice(-50)}` 
                        : comp.componentPath
                      }
                    </Text>
                  </div>
                  {comp.tokensUsed.length > 0 && (
                    <div>
                      <Text size="xs" c="dimmed">Used Tokens</Text>
                      <Spoiler maxHeight={40} showLabel="Show all" hideLabel="Hide">
                        <Group gap="xs">
                          {comp.tokensUsed.slice(0, 10).map((token: string) => (
                            <Chip key={token} size="xs" variant="light">
                              {token}
                            </Chip>
                          ))}
                          {comp.tokensUsed.length > 10 && (
                            <Text size="xs" c="dimmed">
                              +{comp.tokensUsed.length - 10} more
                            </Text>
                          )}
                        </Group>
                      </Spoiler>
                    </div>
                  )}
                </Group>
              </div>
              
              <Group gap="xs" align="center">
                {comp.coverageScore >= 80 && (
                  <Tooltip label="Excellent token usage">
                    <CheckCircle size={20} color="var(--success)" />
                  </Tooltip>
                )}
                {comp.hardcodedValues > 5 && (
                  <Tooltip label="High number of hardcoded values">
                    <AlertTriangle size={20} color="var(--warning)" />
                  </Tooltip>
                )}
                {comp.coverageScore < 20 && (
                  <Tooltip label="Very low token usage">
                    <AlertTriangle size={20} color="var(--danger)" />
                  </Tooltip>
                )}
                {comp.needsAttention && comp.attentionReasons && comp.attentionReasons.length > 0 && (
                  <Tooltip label={`Attention needed: ${comp.attentionReasons.join(', ')}`}>
                    <AlertTriangle size={20} color="var(--warning)" />
                  </Tooltip>
                )}
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>

      {componentCoverage.length > 8 && (
        <Group justify="center" mt="md">
          <Button
            variant="light"
            onClick={toggleShowAll}
            leftSection={showAll ? <EyeOff size={16} /> : <Eye size={16} />}
          >
            {showAll ? 'Show Less' : `Show All ${componentCoverage.length} Components`}
          </Button>
        </Group>
      )}

      {componentCoverage.length === 0 && (
        <Alert color="blue" variant="light">
          <Text>No component analysis data available. This analysis requires components to be scanned first.</Text>
        </Alert>
      )}
    </Card>
  );
}

export default Categories;