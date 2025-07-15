import React, { useState } from 'react';
import { Card, Title, Text, Progress as MantineProgress, Group, Badge, Timeline, Loader, Alert, Stack, Code, Button, Divider } from '@mantine/core';
import { Activity, CheckCircle, XCircle, Clock, Play } from 'lucide-react';
import { useProgress } from '../hooks/useProgress';
import './Progress.css';

interface ProgressProps {
  auditResult?: {
    timestamp: string;
    overallScore: number;
    overallGrade: string;
  };
}

const Progress: React.FC<ProgressProps> = ({ auditResult }) => {
  const { isConnected, progress, currentCategory, message, categoryResults, isComplete, lastAuditTime, isAuditActive } = useProgress();
  const [isStartingAudit, setIsStartingAudit] = useState(false);
  
  // Debug logging
  React.useEffect(() => {
    console.log('[Progress Component] State:', {
      isAuditActive,
      progress,
      currentCategory,
      categoryResultsCount: Object.keys(categoryResults).length,
      isComplete
    });
  }, [isAuditActive, progress, currentCategory, categoryResults, isComplete]);

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

  // Check URL hash to see if we just started an audit
  const isAuditStarting = window.location.hash === '#progress' && 
    (!auditResult || new Date().getTime() - new Date(auditResult.timestamp).getTime() > 60000);
  
  // Use the explicit audit active state from SSE events or if we're just starting
  const hasActiveAudit = isAuditActive || isAuditStarting || progress > 0 || currentCategory || Object.keys(categoryResults).length > 0;

  const startNewAudit = async () => {
    setIsStartingAudit(true);
    try {
      const response = await fetch('/api/start-audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to start audit');
      }
      
      const result = await response.json();
      console.log('Audit started:', result.message);
    } catch (error) {
      console.error('Failed to start audit:', error);
      alert('Failed to start audit. Please try again or use the CLI.');
    } finally {
      setIsStartingAudit(false);
    }
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

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
        {!isConnected ? (
          <Card withBorder style={{ backgroundColor: 'var(--bg-surface)' }}>
            <Stack gap="md" align="center">
              <Loader size="lg" />
              <Text>Connecting to audit server...</Text>
            </Stack>
          </Card>
        ) : hasActiveAudit ? (
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
          <Stack gap="lg">
            {/* Last Audit Info */}
            {auditResult && (
              <Card withBorder style={{ backgroundColor: 'var(--bg-surface)' }}>
                <Stack gap="md">
                  <Group justify="space-between" align="center">
                    <Title order={4}>Last Audit</Title>
                    <Badge color="green" variant="light">
                      Score: {auditResult.overallScore} (Grade {auditResult.overallGrade})
                    </Badge>
                  </Group>
                  <Group gap="md">
                    <Clock size={16} color="var(--mantine-color-gray-6)" />
                    <Text size="sm" c="dimmed">
                      Completed on {formatDate(auditResult.timestamp)}
                    </Text>
                  </Group>
                  <Text size="sm">
                    Would you like to perform another audit?
                  </Text>
                </Stack>
              </Card>
            )}
            
            {/* Start New Audit */}
            <Card withBorder style={{ backgroundColor: 'var(--bg-surface)' }}>
              <Stack gap="md">
                <Group justify="space-between" align="center">
                  <Title order={4}>Start New Audit</Title>
                  <Button
                    leftSection={<Play size={16} />}
                    onClick={startNewAudit}
                    loading={isStartingAudit}
                    disabled={!isConnected}
                  >
                    {isStartingAudit ? 'Starting...' : 'Start Audit'}
                  </Button>
                </Group>
                <Text size="sm" c="dimmed">
                  {isConnected 
                    ? 'Click the button above to start a new audit. Progress will be shown in real-time on this page.'
                    : 'Dashboard server must be connected to start an audit.'}
                </Text>
              </Stack>
            </Card>
            
            <Divider label="Or use CLI" labelPosition="center" />
            
            {/* CLI Instructions */}
            <Alert color="blue" title="Alternative: CLI Command" icon={<Activity size={16} />}>
              <Stack gap="md">
                <Text size="sm">
                  You can also start an audit from your terminal:
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
          </Stack>
        )}
      </Stack>
    </div>
  );
};

export default Progress;