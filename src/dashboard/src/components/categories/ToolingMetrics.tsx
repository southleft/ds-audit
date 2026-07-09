import React from 'react';
import { Badge, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { CategoryResult } from '../../types';
import { bool, rec, str, strArr } from '../../lib/metrics';
import { ScoreBreakdown } from '../shared/ScoreBreakdown';

function BooleanRow({ label, value }: { label: string; value: boolean | undefined }) {
  return (
    <Group justify="space-between">
      <Text size="sm">{label}</Text>
      {value === undefined ? (
        <Badge color="gray" variant="light">
          unknown
        </Badge>
      ) : (
        <Badge color={value ? 'green' : 'red'} variant="light">
          {value ? 'yes' : 'no'}
        </Badge>
      )}
    </Group>
  );
}

export function ToolingMetrics({ category }: { category: CategoryResult }) {
  const m = category.metrics;
  const framework = str(m, 'framework');
  const tools = strArr(m, 'toolsDetected') ?? [];

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="md">
          Stack
        </Title>
        <Stack gap={6}>
          <Group justify="space-between">
            <Text size="sm">Framework</Text>
            <Badge variant="light" color="blue">
              {framework && framework !== 'unknown' ? framework : 'not detected'}
            </Badge>
          </Group>
          <BooleanRow label="TypeScript" value={bool(m, 'hasTypeScript')} />
          <BooleanRow label="Storybook" value={bool(m, 'hasStorybook')} />
          <BooleanRow label="Tests" value={bool(m, 'hasTests')} />
        </Stack>

        {tools.length > 0 && (
          <>
            <Text size="sm" fw={600} mt="md" mb={4}>
              Tools detected
            </Text>
            <Group gap={6}>
              {tools.map(tool => (
                <Badge key={tool} variant="light" color="gray">
                  {tool}
                </Badge>
              ))}
            </Group>
          </>
        )}
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="md">
          Score breakdown
        </Title>
        <ScoreBreakdown breakdown={rec(m, 'scoreBreakdown')} />
      </Card>
    </SimpleGrid>
  );
}
