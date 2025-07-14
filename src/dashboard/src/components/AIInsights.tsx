import React from 'react';
import { Title, Card, Text, Alert, List, Badge } from '@mantine/core';
import { AuditResult } from '@types';

interface AIInsightsProps {
  auditResult: AuditResult;
}

const AIInsights: React.FC<AIInsightsProps> = ({ auditResult }) => {
  const hasAIInsights = auditResult.aiInsights && Object.keys(auditResult.aiInsights).length > 0;

  if (!hasAIInsights) {
    return (
      <div style={{ padding: '1rem' }}>
        <Title order={2} mb="xl">AI Insights</Title>
        <Alert color="blue" title="AI Analysis Not Available">
          To enable AI-powered insights, configure your Claude API key in the .dsaudit.json configuration file.
          AI insights provide deeper analysis and contextual recommendations based on your design system patterns.
        </Alert>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem' }}>
      <Title order={2} mb="xl">AI Insights</Title>

      {auditResult.aiInsights?.summary && (
        <Card mb="lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <Title order={4} mb="md">Executive Summary</Title>
          <Text style={{ whiteSpace: 'pre-wrap' }}>{auditResult.aiInsights.summary}</Text>
        </Card>
      )}

      {auditResult.aiInsights?.patterns && (
        <Card mb="lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <Title order={4} mb="md">Detected Patterns</Title>
          <List spacing="sm">
            {auditResult.aiInsights.patterns.map((pattern: string, idx: number) => (
              <List.Item key={idx}>
                <Text>{pattern}</Text>
              </List.Item>
            ))}
          </List>
        </Card>
      )}

      {auditResult.aiInsights?.suggestions && (
        <Card style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <Title order={4} mb="md">Strategic Recommendations</Title>
          {auditResult.aiInsights.suggestions.map((suggestion: any, idx: number) => (
            <div key={idx} style={{ marginBottom: '1rem' }}>
              <Badge color="violet" mb="xs">{suggestion.category}</Badge>
              <Text fw={600}>{suggestion.title}</Text>
              <Text size="sm" c="dimmed" mt={4}>{suggestion.description}</Text>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};

export default AIInsights;