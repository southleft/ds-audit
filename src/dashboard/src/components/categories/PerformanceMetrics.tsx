import React from 'react';
import { Badge, Card, Code, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { CategoryResult } from '../../types';
import { arr, bool, num, rec, strArr } from '../../lib/metrics';
import { ScoreBreakdown } from '../shared/ScoreBreakdown';
import { DataTable } from '../shared/DataTable';

const PACKAGING_LABELS: Record<string, string> = {
  sideEffects: 'sideEffects declaration',
  exportsMap: 'exports map',
  esmEntry: 'ESM entry point',
  typesField: 'types field',
  filesAllowlist: 'files allowlist',
};

interface LargeEntry {
  path?: string;
  sizeKB?: number;
}

export function PerformanceMetrics({ category }: { category: CategoryResult }) {
  const m = category.metrics;
  const packaging = rec(m, 'packaging');
  const hasBuildOutput = bool(m, 'hasBuildOutput');
  const largestEntries = (arr<LargeEntry>(m, 'largestEntries') ?? []).filter(
    e => e && typeof e === 'object'
  );
  const heavyDeps = strArr(m, 'heavyDependencies') ?? [];
  const packagesEvaluated = packaging ? num(packaging, 'packagesEvaluated') : undefined;

  return (
    <Stack>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder radius="md" padding="lg">
          <Title order={4} mb="md">
            Packaging
          </Title>
          {packaging ? (
            <Stack gap={6}>
              {Object.entries(PACKAGING_LABELS).map(([key, label]) => {
                // The auditor emits a fraction (0–1): the share of a monorepo's
                // library packages that declare this field. 1 = every package,
                // 0 = none, in between = partial adoption.
                const value = packaging[key];
                const frac = typeof value === 'number' ? value : undefined;
                return (
                  <Group key={key} justify="space-between">
                    <Text size="sm">{label}</Text>
                    {frac === undefined ? (
                      <Badge color="gray" variant="light">
                        unknown
                      </Badge>
                    ) : frac >= 1 ? (
                      <Badge color="green" variant="light">
                        present
                      </Badge>
                    ) : frac > 0 ? (
                      <Badge color="yellow" variant="light">
                        {Math.round(frac * 100)}% of packages
                      </Badge>
                    ) : (
                      <Badge color="red" variant="light">
                        missing
                      </Badge>
                    )}
                  </Group>
                );
              })}
              {packagesEvaluated !== undefined && (
                <Group justify="space-between">
                  <Text size="sm">Packages evaluated</Text>
                  <Text size="sm">{packagesEvaluated}</Text>
                </Group>
              )}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              No packaging data in this result.
            </Text>
          )}
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Title order={4} mb="md">
            Score breakdown
          </Title>
          <ScoreBreakdown
            breakdown={rec(m, 'scoreBreakdown')}
            labels={{
              packaging: 'Packaging',
              dependencies: 'Runtime dependencies',
              buildOutput: 'Build output size',
            }}
          />
          <Group justify="space-between" mt="md">
            <Text size="sm">Build output present</Text>
            {hasBuildOutput === undefined ? (
              <Badge color="gray" variant="light">
                unknown
              </Badge>
            ) : (
              <Badge color={hasBuildOutput ? 'green' : 'yellow'} variant="light">
                {hasBuildOutput ? 'yes' : 'no — size not assessed'}
              </Badge>
            )}
          </Group>
        </Card>
      </SimpleGrid>

      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="md">
          Largest build entries
        </Title>
        <DataTable<LargeEntry>
          columns={[
            {
              key: 'path',
              header: 'File',
              render: row => <Code>{row.path ?? '—'}</Code>,
            },
            {
              key: 'sizeKB',
              header: 'Size',
              width: 120,
              render: row => (typeof row.sizeKB === 'number' ? `${row.sizeKB} KB` : '—'),
            },
          ]}
          data={largestEntries}
          emptyMessage="No build output found — build the project to measure entry sizes."
        />
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="md">
          Heavy runtime dependencies
        </Title>
        {heavyDeps.length > 0 ? (
          <Group gap={6}>
            {heavyDeps.map(dep => (
              <Badge key={dep} color="orange" variant="light">
                {dep}
              </Badge>
            ))}
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            No heavy runtime dependencies detected.
          </Text>
        )}
      </Card>
    </Stack>
  );
}
