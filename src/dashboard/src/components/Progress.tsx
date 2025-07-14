import React from 'react';
import { Card, Title, Text, Progress as MantineProgress, Group, Badge, Timeline, ThemeIcon, Loader } from '@mantine/core';
import { useProgress } from '../hooks/useProgress';
import './Progress.css';

const Progress: React.FC = () => {
  const { isConnected, progress, currentCategory, message, categoryResults, isComplete } = useProgress();

  const getCategoryIcon = (status?: 'complete' | 'error' | 'in-progress') => {
    switch (status) {
      case 'complete':
        return <ThemeIcon color="green" size={24} radius="xl">✓</ThemeIcon>;
      case 'error':
        return <ThemeIcon color="red" size={24} radius="xl">✗</ThemeIcon>;
      case 'in-progress':
        return <Loader size={20} />;
      default:
        return <ThemeIcon color="gray" size={24} radius="xl">•</ThemeIcon>;
    }
  };

  const categories = [
    'components',
    'tokens', 
    'documentation',
    'governance',
    'tooling',
    'performance',
    'accessibility'
  ];

  return (
    <div className="progress-container">
      <Card className="progress-card">
        <Group justify="space-between" mb="md">
          <div>
            <Title order={3}>Audit Progress</Title>
            <Text size="sm" c="dimmed">{message}</Text>
          </div>
          <Badge color={isConnected ? 'green' : 'red'} variant="dot">
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </Group>

        <MantineProgress
          value={progress}
          size="xl"
          radius="sm"
          color={isComplete ? 'green' : 'blue'}
          striped={!isComplete}
          animated={!isComplete}
          mb="xl"
        />

        <Text ta="center" size="lg" fw={600} mb="xl">
          {progress}% Complete
        </Text>

        <Timeline active={-1} bulletSize={30} lineWidth={2}>
          {categories.map((category) => {
            const result = categoryResults[category];
            const isCurrent = currentCategory === category;
            const status = result ? (result.error ? 'error' : 'complete') : 
                          (isCurrent ? 'in-progress' : undefined);

            return (
              <Timeline.Item
                key={category}
                bullet={getCategoryIcon(status)}
                title={
                  <Group justify="space-between">
                    <Text fw={isCurrent ? 600 : 400}>
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </Text>
                    {result && !result.error && (
                      <Badge color="green" size="sm">
                        Score: {result.score}
                      </Badge>
                    )}
                    {result?.error && (
                      <Badge color="red" size="sm">
                        Error
                      </Badge>
                    )}
                  </Group>
                }
              >
                {isCurrent && (
                  <Text size="sm" c="dimmed">Analyzing...</Text>
                )}
                {result && !result.error && (
                  <Text size="sm" c="dimmed">
                    Grade {result.grade} • {result.findings?.length || 0} findings
                  </Text>
                )}
                {result?.error && (
                  <Text size="sm" c="red">
                    {result.error}
                  </Text>
                )}
              </Timeline.Item>
            );
          })}
        </Timeline>

        {isComplete && (
          <Card className="complete-message" mt="xl">
            <Text size="lg" fw={600} c="green" ta="center">
              ✓ Audit Complete!
            </Text>
            <Text size="sm" c="dimmed" ta="center" mt="xs">
              Refreshing dashboard with results...
            </Text>
          </Card>
        )}
      </Card>
    </div>
  );
};

export default Progress;