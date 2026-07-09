import React from 'react';
import { Card, Group, Progress, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { CategoryResult } from '../../types';
import { num } from '../../lib/metrics';
import { scoreColor } from '../../lib/format';

function CoverageBar({
  label,
  percent,
  count,
  total,
}: {
  label: string;
  percent: number | undefined;
  count: number | undefined;
  total: number | undefined;
}) {
  if (percent === undefined) {
    return (
      <div>
        <Text size="sm" fw={500}>
          {label}
        </Text>
        <Text size="xs" c="dimmed">
          Not available in this result
        </Text>
      </div>
    );
  }
  return (
    <div>
      <Group justify="space-between" mb={4}>
        <Text size="sm" fw={500}>
          {label}
        </Text>
        <Text size="sm" c="dimmed">
          {count !== undefined && total !== undefined ? `${count}/${total} — ` : ''}
          {percent}%
        </Text>
      </Group>
      <Progress value={percent} color={scoreColor(percent)} size="md" radius="sm" />
    </div>
  );
}

export function ComponentsMetrics({ category }: { category: CategoryResult }) {
  const m = category.metrics;
  const total = num(m, 'totalComponents');
  const filesScanned = num(m, 'filesScanned');

  return (
    <Card withBorder radius="md" padding="lg">
      <Title order={4} mb="md">
        Component metrics
      </Title>

      <SimpleGrid cols={{ base: 2, sm: 2 }} mb="lg">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase">
            Components found
          </Text>
          <Text fw={700} size="xl">
            {total ?? '—'}
          </Text>
        </div>
        <div>
          <Text size="xs" c="dimmed" tt="uppercase">
            Files scanned
          </Text>
          <Text fw={700} size="xl">
            {filesScanned ?? '—'}
          </Text>
        </div>
      </SimpleGrid>

      <Stack gap="md">
        <CoverageBar
          label="Test coverage"
          percent={num(m, 'testCoverage')}
          count={num(m, 'componentsWithTests')}
          total={total}
        />
        <CoverageBar
          label="Story coverage"
          percent={num(m, 'storyCoverage')}
          count={num(m, 'componentsWithStories')}
          total={total}
        />
        <CoverageBar
          label="Prop type coverage"
          percent={num(m, 'propTypeCoverage')}
          count={num(m, 'componentsWithPropTypes')}
          total={total}
        />
      </Stack>
    </Card>
  );
}
