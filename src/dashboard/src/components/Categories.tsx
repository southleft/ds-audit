import React, { useState, useEffect } from 'react';
import { Tabs, Card, Title, Text, Badge, Group, Progress, Accordion } from '@mantine/core';
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
    const icons: Record<string, string> = {
      'Components': '🧩',
      'Component Library': '🧩',
      'Tokens': '🎨',
      'Design Tokens': '🎨',
      'Documentation': '📚',
      'Governance': '📋',
      'Tooling': '🛠️',
      'Tooling & Infrastructure': '🛠️',
      'Performance': '⚡',
      'Accessibility': '♿'
    };
    return icons[categoryName] || '📊';
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
                <Text size="2rem">{getCategoryIcon(category.name)}</Text>
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
            <Accordion.Control icon={<Text>📋</Text>}>
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
              <Accordion.Control icon={<Text>📌</Text>}>
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

          {category.metadata && (
            <Accordion.Item value="details">
              <Accordion.Control icon={<Text>📊</Text>}>
                <Text fw={600}>Details & Metrics</Text>
              </Accordion.Control>
              <Accordion.Panel>
                <div className="metadata-grid">
                  {Object.entries(category.metadata).map(([key, value]) => (
                    <div key={key} className="metadata-item">
                      <Text size="sm" c="dimmed">{key.replace(/([A-Z])/g, ' $1').trim()}</Text>
                      <Text fw={600}>{String(value)}</Text>
                    </div>
                  ))}
                </div>
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

export default Categories;