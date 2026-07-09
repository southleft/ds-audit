import React from 'react';
import { Badge, Card, Group, SimpleGrid, Text, Title } from '@mantine/core';
import type { CategoryResult } from '../../types';
import { bool, num, rec, strArr } from '../../lib/metrics';
import { ScoreBreakdown } from '../shared/ScoreBreakdown';

const RULE_LABELS: Record<string, string> = {
  imgMissingAlt: 'Images missing alt text',
  positiveTabIndex: 'Positive tabindex values',
  clickableNonInteractive: 'Clickable non-interactive elements',
};

export function AccessibilityMetrics({ category }: { category: CategoryResult }) {
  const m = category.metrics;
  const lintEnabled = bool(m, 'eslintJsxA11yEnabled');
  const violationCount = num(m, 'staticViolationCount');
  const byRule = rec(m, 'staticViolationsByRule');
  const autoFocusCount = num(m, 'autoFocusCount');
  const tools = strArr(m, 'toolsDetected');

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="md">
          Static analysis
        </Title>

        <Group justify="space-between" mb="sm">
          <Text size="sm">eslint-plugin-jsx-a11y</Text>
          {lintEnabled === undefined ? (
            <Badge color="gray" variant="light">
              unknown
            </Badge>
          ) : (
            <Badge color={lintEnabled ? 'green' : 'red'} variant="light">
              {lintEnabled ? 'enabled' : 'not enabled'}
            </Badge>
          )}
        </Group>

        <Group justify="space-between" mb="sm">
          <Text size="sm">Static violations found</Text>
          <Badge
            color={violationCount === undefined ? 'gray' : violationCount > 0 ? 'orange' : 'green'}
            variant="light"
          >
            {violationCount ?? 'unknown'}
          </Badge>
        </Group>

        {byRule &&
          Object.entries(byRule).map(([rule, count]) => (
            <Group key={rule} justify="space-between" mb={6} pl="md">
              <Text size="sm" c="dimmed">
                {RULE_LABELS[rule] ?? rule}
              </Text>
              <Text size="sm">{typeof count === 'number' ? count : '—'}</Text>
            </Group>
          ))}

        <Group justify="space-between" mb="sm">
          <Text size="sm">autoFocus usages</Text>
          <Badge
            color={autoFocusCount === undefined ? 'gray' : autoFocusCount > 0 ? 'yellow' : 'green'}
            variant="light"
          >
            {autoFocusCount ?? 'unknown'}
          </Badge>
        </Group>

        {tools && tools.length > 0 && (
          <>
            <Text size="sm" fw={600} mt="md" mb={4}>
              Accessibility tooling detected
            </Text>
            <Group gap={6}>
              {tools.map(tool => (
                <Badge key={tool} variant="light" color="blue">
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
        <ScoreBreakdown
          breakdown={rec(m, 'scoreBreakdown')}
          labels={{
            tooling: 'Accessibility tooling',
            lintEnforcement: 'Lint enforcement',
            staticViolations: 'Static violations',
          }}
        />
      </Card>
    </SimpleGrid>
  );
}
