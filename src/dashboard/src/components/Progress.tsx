import React, { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Divider,
  Group,
  Loader,
  Progress as MantineProgress,
  Stack,
  Text,
  Timeline,
  Title,
} from '@mantine/core';
import { Activity, CheckCircle, Clock, Play, Sparkles, XCircle } from 'lucide-react';
import type { AuditResult } from '../types';
import { type CategoryStatus, type ProgressState } from '../hooks/useProgress';
import { startAudit } from '../utils/api';

interface ProgressProps {
  auditResult: AuditResult | null;
  /** Live progress state, owned by App so the header indicator shares one SSE connection. */
  progress: ProgressState;
  /** True while App is (re)fetching results — e.g. right after audit:complete. */
  resultsLoading: boolean;
}

function statusIcon(status: CategoryStatus | undefined, isCurrent: boolean) {
  if (isCurrent || status?.state === 'running') return <Loader size={18} />;
  if (status?.state === 'complete')
    return <CheckCircle size={18} color="var(--mantine-color-green-6)" />;
  if (status?.state === 'error') return <XCircle size={18} color="var(--mantine-color-red-6)" />;
  return <Clock size={18} color="var(--mantine-color-gray-6)" />;
}

const Progress: React.FC<ProgressProps> = ({ auditResult, progress: state, resultsLoading }) => {
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const hasActivity =
    state.isAuditActive || state.isComplete || state.auditError !== null ||
    state.categoryOrder.length > 0;

  const handleStart = async () => {
    setIsStarting(true);
    setStartError(null);
    try {
      await startAudit();
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'Failed to start audit');
    } finally {
      setIsStarting(false);
    }
  };

  const aiActive = state.aiPhase === 'running';

  return (
    <Stack gap="md" maw={860}>
      <div>
        <Title order={2}>Live Progress</Title>
        <Text c="dimmed" size="sm">
          Real-time audit progress, streamed over server-sent events
        </Text>
      </div>

      {/* Connection status */}
      <Card withBorder radius="md" padding="md">
        <Group justify="space-between">
          <Group gap="sm">
            <Activity size={18} />
            <Text size="sm" fw={500}>
              {state.isConnected ? 'Connected to audit server' : 'Waiting for connection...'}
            </Text>
          </Group>
          <Badge color={state.isConnected ? 'green' : 'gray'} variant="dot">
            {state.isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </Group>
      </Card>

      {state.auditError && (
        <Alert color="red" title="Audit failed" icon={<XCircle size={16} />}>
          <Text size="sm">{state.auditError}</Text>
          <Text size="sm" c="dimmed" mt={4}>
            Fix the underlying problem and start a new audit.
          </Text>
        </Alert>
      )}

      {hasActivity ? (
        <Card withBorder radius="md" padding="lg">
          <Stack gap="lg">
            <div>
              <Group justify="space-between" mb="xs">
                <Title order={4}>Current audit</Title>
                <Group gap="xs">
                  {state.totalCategories !== null && (
                    <Text size="sm" c="dimmed">
                      {state.categoryOrder.filter(id => {
                        const s = state.categoryStatus[id];
                        return s && s.state !== 'running';
                      }).length}
                      /{state.totalCategories} categories
                    </Text>
                  )}
                  <Text size="lg" fw={700} c={state.isComplete ? 'green' : 'blue'}>
                    {state.progress}%
                  </Text>
                </Group>
              </Group>
              {state.message && (
                <Text size="sm" c="dimmed" mb="xs">
                  {state.message}
                </Text>
              )}
              <MantineProgress
                value={state.progress}
                size="lg"
                radius="sm"
                color={state.auditError ? 'red' : state.isComplete ? 'green' : 'blue'}
                striped={state.isAuditActive}
                animated={state.isAuditActive}
              />
            </div>

            <Timeline active={-1} bulletSize={30} lineWidth={2}>
              {state.categoryOrder.map(categoryId => {
                const status = state.categoryStatus[categoryId];
                const isCurrent = state.currentCategory === categoryId;
                return (
                  <Timeline.Item
                    key={categoryId}
                    bullet={statusIcon(status, isCurrent)}
                    title={
                      <Group justify="space-between">
                        <Text size="sm" fw={isCurrent ? 600 : 400} tt="capitalize">
                          {categoryId}
                        </Text>
                        {status?.state === 'complete' && status.score !== undefined && (
                          <Badge color="green" size="sm" variant="light">
                            Score: {status.score}
                          </Badge>
                        )}
                        {status?.state === 'error' && (
                          <Badge color="red" size="sm" variant="light">
                            Failed
                          </Badge>
                        )}
                      </Group>
                    }
                  >
                    {isCurrent && (
                      <Text size="xs" c="dimmed">
                        Analyzing...
                      </Text>
                    )}
                    {status?.state === 'complete' && (
                      <Text size="xs" c="dimmed">
                        {status.grade !== undefined ? `Grade ${status.grade}` : ''}
                        {status.findingsCount !== undefined
                          ? `${status.grade !== undefined ? ' • ' : ''}${status.findingsCount} findings`
                          : ''}
                      </Text>
                    )}
                    {status?.state === 'error' && (
                      <Text size="xs" c="red">
                        {status.error ?? 'Category failed — excluded from the overall score'}
                      </Text>
                    )}
                  </Timeline.Item>
                );
              })}

              {/* AI judge phase — shown once ai:* events arrive */}
              {state.aiPhase !== 'idle' && (
                <Timeline.Item
                  bullet={
                    aiActive ? (
                      <Loader size={18} />
                    ) : state.aiPhase === 'complete' ? (
                      <CheckCircle size={18} color="var(--mantine-color-green-6)" />
                    ) : (
                      <XCircle size={18} color="var(--mantine-color-red-6)" />
                    )
                  }
                  title={
                    <Group gap="xs">
                      <Sparkles size={14} />
                      <Text size="sm" fw={aiActive ? 600 : 400}>
                        AI judge review
                      </Text>
                      {state.aiPhase === 'error' && (
                        <Badge color="red" size="sm" variant="light">
                          Failed
                        </Badge>
                      )}
                    </Group>
                  }
                >
                  {aiActive && (
                    <Text size="xs" c="dimmed">
                      {state.aiCurrentCategory
                        ? `Reviewing ${state.aiCurrentCategory}...`
                        : 'AI judge reviewing...'}
                    </Text>
                  )}
                  {state.aiPhase === 'error' && (
                    <Text size="xs" c="red">
                      {state.aiError ?? 'AI judge failed'} — scores are deterministic only
                    </Text>
                  )}
                </Timeline.Item>
              )}
            </Timeline>

            {state.isComplete && (
              <Alert color="green" title="Audit complete" icon={<CheckCircle size={16} />}>
                {resultsLoading ? (
                  <Group gap="xs">
                    <Loader size={14} />
                    <Text size="sm">Loading fresh results...</Text>
                  </Group>
                ) : (
                  <Text size="sm">
                    Results are loaded — the Overview, Categories, and Action Plan now reflect this
                    run.
                  </Text>
                )}
              </Alert>
            )}
          </Stack>
        </Card>
      ) : (
        <Stack gap="md">
          {auditResult && auditResult.categories?.length > 0 && (
            <Card withBorder radius="md" padding="lg">
              <Group justify="space-between" mb="xs">
                <Title order={4}>Last audit</Title>
                <Badge color="green" variant="light">
                  Score: {auditResult.overallScore} (Grade {auditResult.overallGrade})
                </Badge>
              </Group>
              <Group gap="xs">
                <Clock size={14} color="var(--mantine-color-gray-6)" />
                <Text size="sm" c="dimmed">
                  Completed {new Date(auditResult.timestamp).toLocaleString()}
                </Text>
              </Group>
            </Card>
          )}

          <Card withBorder radius="md" padding="lg">
            <Group justify="space-between" mb="xs">
              <Title order={4}>Start new audit</Title>
              <Button
                leftSection={<Play size={16} />}
                onClick={handleStart}
                loading={isStarting}
                disabled={!state.isConnected}
              >
                Start audit
              </Button>
            </Group>
            <Text size="sm" c="dimmed">
              {state.isConnected
                ? 'Runs the audit with the current configuration. Progress appears here in real time.'
                : 'The dashboard server must be connected to start an audit.'}
            </Text>
            {startError && (
              <Alert color="red" mt="sm">
                {startError}
              </Alert>
            )}
          </Card>

          <Divider label="Or use the CLI" labelPosition="center" />

          <Alert color="blue" title="Run from the terminal" icon={<Activity size={16} />}>
            <Code block>dsaudit run --dashboard</Code>
            <Text size="xs" c="dimmed" mt="xs">
              Progress appears here automatically when an audit starts. Keep this page open to
              monitor updates.
            </Text>
          </Alert>
        </Stack>
      )}
    </Stack>
  );
};

export default Progress;
