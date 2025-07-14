import React, { useState } from 'react';
import { Tabs, Card, Title, Text, Badge, Group, List, ThemeIcon, Progress, Accordion } from '@mantine/core';
import { AuditResult, CategoryResult } from '@types';
import './Categories.css';

interface CategoriesProps {
  auditResult: AuditResult;
}

const Categories: React.FC<CategoriesProps> = ({ auditResult }) => {
  const [activeTab, setActiveTab] = useState<string | null>(auditResult.categories[0]?.name || null);

  const getIconForStatus = (status: string) => {
    switch (status) {
      case 'success':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      default:
        return '📌';
    }
  };

  const getCategoryIcon = (categoryName: string) => {
    const icons: Record<string, string> = {
      'Components': '🧩',
      'Tokens': '🎨',
      'Documentation': '📚',
      'Governance': '📋',
      'Tooling': '🛠️',
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

  const renderCategoryDetails = (category: CategoryResult) => {
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

        <Accordion multiple defaultValue={['working', 'missing', 'recommendations']} variant="separated">
          <Accordion.Item value="working">
            <Accordion.Control icon={<Text>✅</Text>}>
              <Text fw={600}>What's Working ({category.findings?.filter(f => f.type === 'success').length || 0})</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <List spacing="sm">
                {category.findings?.filter(f => f.type === 'success').map((finding, idx) => (
                  <List.Item
                    key={idx}
                    icon={
                      <ThemeIcon color="green" size={24} radius="xl">
                        ✓
                      </ThemeIcon>
                    }
                  >
                    <Text>{finding.message}</Text>
                    {finding.details && (
                      <Text size="sm" c="dimmed" mt={4}>{finding.details}</Text>
                    )}
                  </List.Item>
                )) || <Text c="dimmed">No successes recorded</Text>}
              </List>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="missing">
            <Accordion.Control icon={<Text>⚠️</Text>}>
              <Text fw={600}>What's Missing ({category.findings?.filter(f => f.type === 'warning' || f.type === 'error').length || 0})</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <List spacing="sm">
                {category.findings?.filter(f => f.type === 'warning' || f.type === 'error').map((finding, idx) => (
                  <List.Item
                    key={idx}
                    icon={
                      <ThemeIcon color={finding.type === 'error' ? 'red' : 'yellow'} size={24} radius="xl">
                        {finding.type === 'error' ? '✗' : '!'}
                      </ThemeIcon>
                    }
                  >
                    <Text>{finding.message}</Text>
                    {finding.details && (
                      <Text size="sm" c="dimmed" mt={4}>{finding.details}</Text>
                    )}
                  </List.Item>
                )) || <Text c="dimmed">No issues found</Text>}
              </List>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="recommendations">
            <Accordion.Control icon={<Text>📌</Text>}>
              <Text fw={600}>Recommendations ({category.recommendations?.length || 0})</Text>
            </Accordion.Control>
            <Accordion.Panel>
              {category.recommendations?.map((rec, idx) => (
                <Card key={idx} className="recommendation-card" mb="sm">
                  <Group justify="space-between" mb="xs">
                    <Text fw={600}>{rec.title}</Text>
                    <Group gap="xs">
                      <Badge color={rec.priority === 'high' ? 'red' : rec.priority === 'medium' ? 'yellow' : 'green'}>
                        {rec.priority} priority
                      </Badge>
                      <Badge variant="light">
                        {rec.effort}
                      </Badge>
                    </Group>
                  </Group>
                  <Text size="sm">{rec.description}</Text>
                  {rec.impact && (
                    <Text size="xs" c="dimmed" mt="xs">Impact: {rec.impact}</Text>
                  )}
                </Card>
              )) || <Text c="dimmed">No recommendations available</Text>}
            </Accordion.Panel>
          </Accordion.Item>

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
      <Title order={2} mb="xl">Category Analysis</Title>
      
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

export default Categories;