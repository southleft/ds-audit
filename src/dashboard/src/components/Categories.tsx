import React, { useState, useEffect } from 'react';
import { Tabs, Card, Title, Text, Badge, Group, Progress, Accordion } from '@mantine/core';
import { Puzzle, Palette, BookOpen, Clipboard, Wrench, Zap, Accessibility, BarChart3, FileCheck, MapPin } from 'lucide-react';
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

        <Accordion multiple defaultValue={['findings', 'recommendations']} variant="separated">
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

                    {/* Token Coverage Section */}
                    {category.metrics.coverage && renderTokenCoverage(category.metrics.coverage)}

                    {/* Token Redundancies Section */}
                    {category.metrics.redundancies && category.metrics.redundancies.length > 0 && renderTokenRedundancies(category.metrics.redundancies)}

                    {/* Component Coverage Section */}
                    {category.metrics.componentCoverage && renderComponentCoverage(category.metrics.componentCoverage)}
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
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

// Render token coverage metrics
function renderTokenCoverage(coverage: any) {
  return (
    <Card mt="lg" p="md" withBorder>
      <Title order={6} mb="md">Token Coverage Analysis</Title>
      
      <Group mb="md">
        <div>
          <Text size="xs" c="dimmed">Total Tokens</Text>
          <Text size="xl" fw={700}>{coverage.totalTokens}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">Used Tokens</Text>
          <Text size="xl" fw={700} c="green">{coverage.usedTokens}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">Coverage</Text>
          <Text size="xl" fw={700} c={coverage.coveragePercentage > 70 ? 'green' : 'orange'}>
            {coverage.coveragePercentage.toFixed(1)}%
          </Text>
        </div>
      </Group>

      <Progress value={coverage.coveragePercentage} color={coverage.coveragePercentage > 70 ? 'green' : 'orange'} size="md" radius="sm" mb="lg" />

      {coverage.byCategory && Object.entries(coverage.byCategory).map(([category, data]: [string, any]) => (
        <div key={category} style={{ marginBottom: '1rem' }}>
          <Group justify="space-between" mb="xs">
            <Text fw={500}>{formatMetricName(category)}</Text>
            <Badge size="sm" variant="light">
              {data.used}/{data.total} ({data.percentage.toFixed(0)}%)
            </Badge>
          </Group>
          <Progress value={data.percentage} size="xs" radius="sm" />
        </div>
      ))}

      {coverage.unusedTokens && coverage.unusedTokens.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <Text size="sm" fw={500} mb="xs">Unused Tokens ({coverage.unusedTokens.length})</Text>
          <div style={{ maxHeight: '100px', overflowY: 'auto' }}>
            {coverage.unusedTokens.map((token: string) => (
              <Badge key={token} size="xs" variant="light" color="gray" mr="xs" mb="xs">
                {token}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// Render token redundancies
function renderTokenRedundancies(redundancies: any[]) {
  return (
    <Card mt="lg" p="md" withBorder>
      <Title order={6} mb="md">Token Redundancies</Title>
      <Text size="sm" c="dimmed" mb="md">
        Found {redundancies.length} sets of potentially redundant tokens
      </Text>
      
      {redundancies.slice(0, 5).map((redundancy: any, index: number) => (
        <div key={index} style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: 'var(--mantine-color-gray-light)' }}>
          <Group justify="space-between" mb="xs">
            <Badge size="sm" variant="filled" color="orange">
              {redundancy.type}
            </Badge>
            <Text size="xs" c="dimmed">
              {(redundancy.similarity * 100).toFixed(0)}% similar
            </Text>
          </Group>
          {redundancy.tokens.map((token: any, i: number) => (
            <Text key={i} size="sm">
              <span style={{ fontWeight: 600 }}>{token.name}</span>: {token.value}
            </Text>
          ))}
          {redundancy.suggestion && (
            <Text size="xs" c="dimmed" mt="xs">{redundancy.suggestion}</Text>
          )}
        </div>
      ))}
      
      {redundancies.length > 5 && (
        <Text size="sm" c="dimmed" ta="center">
          And {redundancies.length - 5} more...
        </Text>
      )}
    </Card>
  );
}

// Render component coverage
function renderComponentCoverage(componentCoverage: any[]) {
  const lowCoverage = componentCoverage.filter((c: any) => c.coverageScore < 50);
  const highCoverage = componentCoverage.filter((c: any) => c.coverageScore >= 80);
  
  return (
    <Card mt="lg" p="md" withBorder>
      <Title order={6} mb="md">Component Token Usage</Title>
      
      {lowCoverage.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <Text size="sm" fw={500} c="orange" mb="xs">
            Components with Low Token Usage ({lowCoverage.length})
          </Text>
          {lowCoverage.slice(0, 5).map((comp: any) => (
            <Group key={comp.componentPath} justify="space-between" mb="xs">
              <Text size="sm">{comp.componentName}</Text>
              <Group gap="xs">
                <Badge size="xs" color="orange" variant="light">
                  {comp.coverageScore.toFixed(0)}% coverage
                </Badge>
                {comp.hardcodedValues > 0 && (
                  <Badge size="xs" color="red" variant="light">
                    {comp.hardcodedValues} hardcoded
                  </Badge>
                )}
              </Group>
            </Group>
          ))}
        </div>
      )}
      
      {highCoverage.length > 0 && (
        <div>
          <Text size="sm" fw={500} c="green" mb="xs">
            Components with Good Token Usage ({highCoverage.length})
          </Text>
          {highCoverage.slice(0, 3).map((comp: any) => (
            <Group key={comp.componentPath} justify="space-between" mb="xs">
              <Text size="sm">{comp.componentName}</Text>
              <Badge size="xs" color="green" variant="light">
                {comp.coverageScore.toFixed(0)}% coverage
              </Badge>
            </Group>
          ))}
        </div>
      )}
    </Card>
  );
}

export default Categories;