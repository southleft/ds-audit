import React from 'react';
import { Title, Card, Text, Badge, Group, List, ThemeIcon } from '@mantine/core';
import { AuditResult } from '@types';

interface RecommendationsProps {
  auditResult: AuditResult;
}

const Recommendations: React.FC<RecommendationsProps> = ({ auditResult }) => {
  const allRecommendations = auditResult.recommendations || [];
  
  const groupedRecommendations = {
    high: allRecommendations.filter(r => r.priority === 'high'),
    medium: allRecommendations.filter(r => r.priority === 'medium'),
    low: allRecommendations.filter(r => r.priority === 'low')
  };

  const getPriorityColor = (priority: string) => {
    return priority === 'high' ? 'red' : priority === 'medium' ? 'yellow' : 'green';
  };

  return (
    <div style={{ padding: '1rem' }}>
      <Title order={2} mb="xl">Recommendations</Title>

      {Object.entries(groupedRecommendations).map(([priority, recs]) => (
        recs.length > 0 && (
          <Card key={priority} mb="lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <Group mb="md">
              <Badge size="lg" color={getPriorityColor(priority)}>
                {priority.toUpperCase()} PRIORITY
              </Badge>
              <Text c="dimmed">({recs.length} recommendations)</Text>
            </Group>

            <List spacing="md">
              {recs.map((rec, idx) => (
                <List.Item
                  key={idx}
                  icon={
                    <ThemeIcon color={getPriorityColor(priority)} size={24} radius="xl">
                      {priority === 'high' ? '!' : priority === 'medium' ? '•' : '✓'}
                    </ThemeIcon>
                  }
                >
                  <Text fw={600}>{rec.title}</Text>
                  <Text size="sm" c="dimmed" mt={4}>{rec.description}</Text>
                  {rec.effort && (
                    <Badge size="sm" variant="light" mt={8}>
                      {rec.effort}
                    </Badge>
                  )}
                </List.Item>
              ))}
            </List>
          </Card>
        )
      ))}
    </div>
  );
};

export default Recommendations;