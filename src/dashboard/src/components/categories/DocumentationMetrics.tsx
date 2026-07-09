import React from 'react';
import { Badge, Card, Group, Progress, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { CategoryResult } from '../../types';
import { bool, num, rec } from '../../lib/metrics';
import { scoreColor } from '../../lib/format';
import { ScoreBreakdown } from '../shared/ScoreBreakdown';

const DOC_TYPE_LABELS: Record<string, string> = {
  component: 'Component docs',
  system: 'System docs',
  api: 'API docs',
  guide: 'Guides',
};

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

export function DocumentationMetrics({ category }: { category: CategoryResult }) {
  const m = category.metrics;
  const totalDocs = num(m, 'totalDocs');
  const docTypes = rec(m, 'docTypes');
  const avgCompleteness = num(m, 'averageCompleteness');
  const governanceDocsFound = num(m, 'governanceDocsFound');

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="md">
          Documentation corpus
        </Title>

        <Group justify="space-between" mb="sm">
          <Text size="sm">Documents found</Text>
          <Text fw={600}>{totalDocs ?? '—'}</Text>
        </Group>

        {docTypes &&
          Object.entries(docTypes).map(([type, count]) => (
            <Group key={type} justify="space-between" mb={6} pl="md">
              <Text size="sm" c="dimmed">
                {DOC_TYPE_LABELS[type] ?? type}
              </Text>
              <Text size="sm">{typeof count === 'number' ? count : '—'}</Text>
            </Group>
          ))}

        {avgCompleteness !== undefined && (
          <div style={{ marginTop: 12 }}>
            <Group justify="space-between" mb={4}>
              <Text size="sm" fw={500}>
                Average structural completeness
              </Text>
              <Text size="sm" c="dimmed">
                {avgCompleteness}%
              </Text>
            </Group>
            <Progress
              value={avgCompleteness}
              color={scoreColor(avgCompleteness)}
              size="md"
              radius="sm"
            />
          </div>
        )}

        <Stack gap={6} mt="md">
          <BooleanRow label="Storybook" value={bool(m, 'hasStorybook')} />
          <BooleanRow label="Versioning strategy" value={bool(m, 'hasVersioning')} />
          <Group justify="space-between">
            <Text size="sm">Governance docs found</Text>
            <Text size="sm" fw={600}>
              {governanceDocsFound ?? '—'}
            </Text>
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="md">
          Score breakdown
        </Title>
        <ScoreBreakdown
          breakdown={rec(m, 'scoreBreakdown')}
          labels={{
            readme: 'README',
            docsCorpus: 'Docs corpus',
            storybook: 'Storybook',
            contributing: 'Contributing guide',
            changelog: 'Changelog',
            versioning: 'Versioning',
            docsIndex: 'Docs index',
          }}
        />
      </Card>
    </SimpleGrid>
  );
}
