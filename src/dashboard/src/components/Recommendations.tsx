import React from 'react';
import { Title, Badge, Text, Stack, Group, Paper, Divider, Box } from '@mantine/core';
import { AuditResult } from '@types';
import ExpandableTable from './shared/ExpandableTable';

interface RecommendationsProps {
  auditResult: AuditResult;
}

const Recommendations: React.FC<RecommendationsProps> = ({ auditResult }) => {
  const allRecommendations = auditResult.recommendations || [];

  // Transform recommendations to add better titles and additional context
  const transformedRecommendations = allRecommendations.map(rec => {
    // Create more descriptive titles from the description
    let improvedTitle = rec.title;
    if (rec.title === "Address issue in Component Library" || rec.title.includes("Address issue")) {
      // Extract meaningful title from description
      const descWords = rec.description.split(' ').slice(0, 8).join(' ');
      improvedTitle = descWords.length > 50 ? `${descWords.substring(0, 50)}...` : descWords;
    }

    return {
      ...rec,
      improvedTitle,
      category: rec.category || 'General', // Add category if available
      estimatedHours: getEstimatedHours(rec.effort), // Convert effort to estimated hours
      priorityScore: getPriorityScore(rec.priority), // Numeric priority for sorting
      impactScore: getImpactScore(rec.impact || 'medium') // Numeric impact for sorting
    };
  });

  // Function to render expanded content for each recommendation
  const renderExpandedContent = (recommendation: any) => {
    return (
      <Stack gap="md">
        <Paper p="md" withBorder style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <Stack gap="md">
            {/* Full Description */}
            <Box>
              <Group gap="xs" mb="sm">
                <Text>📋</Text>
                <Text fw={600}>Full Description</Text>
              </Group>
              <Text size="sm" style={{ lineHeight: 1.6 }}>
                {recommendation.description}
              </Text>
            </Box>

            {/* Implementation Guide - Only show if available */}
            {recommendation.implementation && (
              <Box>
                <Group gap="xs" mb="sm">
                  <Text>🔧</Text>
                  <Text fw={600}>Implementation Details</Text>
                </Group>
                <Text size="sm" style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {recommendation.implementation}
                </Text>
              </Box>
            )}

            {/* AI Insights Notice */}
            <Box>
              <Paper p="sm" withBorder style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}>
                <Group gap="xs">
                  <Text>🤖</Text>
                  <Text size="xs" c="dimmed">
                    For detailed implementation guidance and code examples, use the "Ask Claude" feature in the AI Analysis section.
                  </Text>
                </Group>
              </Paper>
            </Box>

            {/* Metadata */}
            <Divider my="sm" />
            <Group gap="xl">
              <Box>
                <Text size="xs" c="dimmed">Estimated Time</Text>
                <Text size="sm" fw={600}>{recommendation.estimatedHours}</Text>
              </Box>
              <Box>
                <Text size="xs" c="dimmed">Category</Text>
                <Badge size="sm" variant="light">{recommendation.category}</Badge>
              </Box>
              <Box>
                <Text size="xs" c="dimmed">Priority</Text>
                <Badge size="sm" color={getPriorityColor(recommendation.priority)}>
                  {recommendation.priority.toUpperCase()}
                </Badge>
              </Box>
              <Box>
                <Text size="xs" c="dimmed">Impact</Text>
                <Badge size="sm" color={getImpactColor(recommendation.impact)} variant="dot">
                  {recommendation.impact || 'Medium'} Impact
                </Badge>
              </Box>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    );
  };

  const getPriorityColor = (priority: string) => {
    return priority === 'high' ? 'red' : priority === 'medium' ? 'yellow' : 'green';
  };
  
  const getEffortColor = (effort: string) => {
    switch (effort) {
      case 'quick-win': return 'green';
      case 'medium':
      case 'medium-lift': return 'blue';
      case 'heavy':
      case 'heavy-lift': return 'orange';
      default: return 'blue';
    }
  };

  const getImpactColor = (impact: string) => {
    return impact === 'high' ? 'green' : impact === 'medium' ? 'blue' : 'gray';
  };

  const columns = [
    {
      key: 'improvedTitle',
      label: 'Issue',
      sortable: true,
      width: '35%',
      render: (value: string, row: any) => (
        <Text fw={600} size="sm">{value}</Text>
      )
    },
    {
      key: 'category',
      label: 'Category',
      sortable: true,
      width: '15%',
      render: (value: string) => (
        <Badge size="sm" variant="light">{value}</Badge>
      )
    },
    {
      key: 'priority',
      label: 'Priority',
      sortable: true,
      width: '12%',
      render: (value: string) => (
        <Badge color={getPriorityColor(value)} size="sm">{value.toUpperCase()}</Badge>
      )
    },
    {
      key: 'effort',
      label: 'Effort',
      sortable: true,
      width: '12%',
      render: (value: string) => (
        <Badge color={getEffortColor(value)} size="sm" variant="light">{value}</Badge>
      )
    },
    {
      key: 'impact',
      label: 'Impact',
      sortable: true,
      width: '12%',
      render: (value: string) => (
        <Badge color={getImpactColor(value)} size="sm" variant="outline">{value || 'Medium'}</Badge>
      )
    },
    {
      key: 'estimatedHours',
      label: 'Time Est.',
      sortable: true,
      width: '14%',
      render: (value: string) => (
        <Text size="sm" c="dimmed">{value}</Text>
      )
    }
  ];

  const filters = [
    {
      key: 'priority',
      label: 'Priority',
      options: [
        { value: 'high', label: 'High Priority' },
        { value: 'medium', label: 'Medium Priority' },
        { value: 'low', label: 'Low Priority' }
      ]
    },
    {
      key: 'effort',
      label: 'Effort',
      options: [
        { value: 'quick-win', label: 'Quick Win' },
        { value: 'medium', label: 'Medium' },
        { value: 'medium-lift', label: 'Medium' },
        { value: 'heavy', label: 'Heavy' },
        { value: 'heavy-lift', label: 'Heavy' }
      ]
    },
    {
      key: 'impact',
      label: 'Impact',
      options: [
        { value: 'high', label: 'High Impact' },
        { value: 'medium', label: 'Medium Impact' },
        { value: 'low', label: 'Low Impact' }
      ]
    },
    {
      key: 'category',
      label: 'Category',
      options: [...new Set(transformedRecommendations.map(r => r.category))].map(cat => ({
        value: cat,
        label: cat
      }))
    }
  ];

  return (
    <div style={{ padding: '1rem' }}>
      <Title order={2} mb="xl">Recommendations</Title>
      
      <ExpandableTable
        data={transformedRecommendations}
        columns={columns}
        filters={filters}
        searchable={true}
        searchPlaceholder="Search recommendations..."
        defaultPageSize={15}
        pageSizeOptions={[10, 15, 25, 50, 100]}
        subtitle={`${allRecommendations.length} total recommendations to improve your design system`}
        expandedContent={renderExpandedContent}
      />
    </div>
  );
};

// Helper functions - minimal set needed for display
function getEstimatedHours(effort: string): string {
  switch (effort) {
    case 'quick-win': return '1-2h';
    case 'medium':
    case 'medium-lift': return '4-8h';
    case 'heavy':
    case 'heavy-lift': return '16-40h';
    default: return '4-8h';
  }
}

function getPriorityScore(priority: string): number {
  switch (priority) {
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 2;
  }
}

function getImpactScore(impact: string): number {
  switch (impact) {
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 2;
  }
}

export default Recommendations;