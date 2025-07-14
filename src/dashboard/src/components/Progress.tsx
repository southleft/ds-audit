import React from 'react';
import { Card, Title, Text, Progress as MantineProgress, Group, Badge, Timeline, ThemeIcon, Loader, Alert, Stack, Code } from '@mantine/core';
import { Activity, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useProgress } from '../hooks/useProgress';
import './Progress.css';

const Progress: React.FC = () => {
  const { isConnected, progress, currentCategory, message, categoryResults, isComplete } = useProgress();

  const getCategoryIcon = (status?: 'complete' | 'error' | 'in-progress') => {
    switch (status) {
      case 'complete':
        return <CheckCircle size={20} color="var(--mantine-color-green-6)" />;
      case 'error':
        return <XCircle size={20} color="var(--mantine-color-red-6)" />;
      case 'in-progress':
        return <Loader size={20} />;
      default:
        return <Clock size={20} color="var(--mantine-color-gray-6)" />;
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

  const hasActiveAudit = progress > 0 || currentCategory || Object.keys(categoryResults).length > 0;

  return (
    <div style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
      <Stack gap="xl">
        {/* Page Header */}
        <div>
          <Text size="xs" c="dimmed" fw={500} tt="uppercase" mb={4}>Tools</Text>
          <Title order={1} size="h2">Live Progress</Title>
          <Text c="dimmed" size="sm">
            Monitor real-time audit progress when running from the CLI
          </Text>
        </div>

        {/* Connection Status */}
        <Card withBorder style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <Group justify="space-between" align="center">
            <Group gap="md">
              <Activity size={20} />
              <div>
                <Text fw={600}>Connection Status</Text>
                <Text size="sm" c="dimmed">
                  {isConnected ? 'Connected to audit server' : 'Waiting for connection...'}
                </Text>
              </div>
            </Group>
            <Badge color={isConnected ? 'green' : 'gray'} variant="dot">
              {isConnected ? 'Connected' : 'Disconnected'}
            </Badge>
          </Group>
        </Card>

        {/* Progress Section */}
        {hasActiveAudit ? (
          <Card withBorder style={{ backgroundColor: 'var(--bg-surface)' }}>
            <Stack gap="lg">
              <div>
                <Group justify="space-between" align="center" mb="md">
                  <Title order={3}>Current Audit</Title>
                  <Text size="lg" fw={600} c={isComplete ? 'green' : 'blue'}>
                    {progress}% Complete
                  </Text>
                </Group>
                
                <Text size="sm" c="dimmed" mb="md">{message}</Text>
                
                <MantineProgress
                  value={progress}
                  size="lg"
                  radius="sm"
                  color={isComplete ? 'green' : 'blue'}
                  striped={!isComplete}
                  animated={!isComplete}
                />
              </div>

              <Timeline active={-1} bulletSize={32} lineWidth={2}>
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
                        <Group justify="space-between" align="center">
                          <Text fw={isCurrent ? 600 : 400} size="sm">
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
                        <Text size="xs" c="dimmed">Analyzing...</Text>
                      )}
                      {result && !result.error && (
                        <Text size="xs" c="dimmed">
                          Grade {result.grade} • {result.findings?.length || 0} findings
                        </Text>
                      )}
                      {result?.error && (
                        <Text size="xs" c="red">
                          {result.error}
                        </Text>
                      )}
                    </Timeline.Item>
                  );
                })}
              </Timeline>

              {isComplete && (
                <Alert color="green" title="Audit Complete!" icon={<CheckCircle size={16} />}>
                  <Text size="sm">
                    Audit completed successfully! Dashboard will refresh with new results shortly.
                  </Text>
                </Alert>
              )}
            </Stack>
          </Card>
        ) : (
          <Alert color="blue" title="Waiting for Audit" icon={<Activity size={16} />}>
            <Stack gap="md">
              <Text size="sm">
                No audit is currently running. To start a new audit and see live progress, run the following command in your terminal:
              </Text>
              <Code block style={{ fontSize: '12px', backgroundColor: 'var(--bg-tertiary)' }}>
                npm run build{'\n'}
                node dist/cli.js init --path /path/to/your-design-system
              </Code>
              <Text size="xs" c="dimmed">
                The progress will appear here automatically when an audit starts. Keep this page open to monitor real-time updates.
              </Text>
            </Stack>
          </Alert>
        )}
      </Stack>
    </div>
  );
};

export default Progress;