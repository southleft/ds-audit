import React, { useEffect, useState } from 'react';
import { Badge, Card, Group, RingProgress, Stack, Tabs, Text, Title } from '@mantine/core';
import type { AuditResult, CategoryResult } from '../types';
import { formatWeight, scoreColor } from '../lib/format';
import { FindingsList } from './FindingsList';
import { JudgePanel } from './JudgePanel';
import { ComponentsMetrics } from './categories/ComponentsMetrics';
import { TokensMetrics } from './categories/TokensMetrics';
import { DocumentationMetrics } from './categories/DocumentationMetrics';
import { ToolingMetrics } from './categories/ToolingMetrics';
import { PerformanceMetrics } from './categories/PerformanceMetrics';
import { AccessibilityMetrics } from './categories/AccessibilityMetrics';

/** Category-specific metrics panels, keyed by stable category id. */
const METRICS_PANELS: Record<string, React.ComponentType<{ category: CategoryResult }>> = {
  components: ComponentsMetrics,
  tokens: TokensMetrics,
  documentation: DocumentationMetrics,
  tooling: ToolingMetrics,
  performance: PerformanceMetrics,
  accessibility: AccessibilityMetrics,
};

function CategoryHeader({ category }: { category: CategoryResult }) {
  const issueCount = category.findings?.filter(f => f.type !== 'success').length ?? 0;
  const deterministic = category.deterministicScore;

  return (
    <Card withBorder radius="md" padding="lg">
      <Group gap="xl" wrap="wrap">
        <RingProgress
          size={110}
          thickness={10}
          roundCaps
          sections={[{ value: category.score, color: scoreColor(category.score) }]}
          label={
            <Stack gap={0} align="center">
              <Text fw={700} size="lg">
                {category.score}
              </Text>
              <Text size="xs" c="dimmed">
                / 100
              </Text>
            </Stack>
          }
        />
        <Stack gap={4} style={{ flex: 1, minWidth: 200 }}>
          <Group gap="xs">
            <Title order={3}>{category.name}</Title>
            <Badge color={scoreColor(category.score)} variant="filled" size="lg">
              {category.grade}
            </Badge>
          </Group>
          <Group gap="md">
            <Text size="sm" c="dimmed">
              Weight in overall score: <strong>{formatWeight(category.weight)}</strong>
            </Text>
            <Text size="sm" c="dimmed">
              {issueCount} issue{issueCount === 1 ? '' : 's'} found
            </Text>
          </Group>
          {category.judge && deterministic !== undefined && (
            <Text size="sm" c="dimmed">
              Score blends static analysis with AI judge review — see the breakdown below.
            </Text>
          )}
        </Stack>
      </Group>
    </Card>
  );
}

function CategoryDetail({ category }: { category: CategoryResult }) {
  const MetricsPanel = METRICS_PANELS[category.id];

  return (
    <Stack mt="md">
      <CategoryHeader category={category} />
      {category.judge && <JudgePanel category={category} />}
      {MetricsPanel && <MetricsPanel category={category} />}
      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="md">
          Findings
        </Title>
        <FindingsList findings={category.findings ?? []} />
      </Card>
    </Stack>
  );
}

interface CategoriesProps {
  auditResult: AuditResult;
  /** Category id to focus, e.g. when navigating from the Overview. */
  initialCategoryId?: string | null;
}

const Categories: React.FC<CategoriesProps> = ({ auditResult, initialCategoryId }) => {
  const categories = auditResult.categories ?? [];
  const validInitial =
    initialCategoryId && categories.some(c => c.id === initialCategoryId)
      ? initialCategoryId
      : (categories[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState<string | null>(validInitial);

  // Follow navigation from the Overview after mount
  useEffect(() => {
    if (initialCategoryId && categories.some(c => c.id === initialCategoryId)) {
      setActiveTab(initialCategoryId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCategoryId]);

  if (categories.length === 0) {
    return (
      <Stack>
        <Title order={2}>Categories</Title>
        <Text c="dimmed">
          No category results available. Run an audit to see per-category analysis.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Categories</Title>
        <Text c="dimmed" size="sm">
          Per-category scores, metrics, and findings from the latest audit
        </Text>
      </div>

      <Tabs value={activeTab} onChange={setActiveTab} keepMounted={false}>
        <Tabs.List>
          {categories.map(category => (
            <Tabs.Tab
              key={category.id}
              value={category.id}
              rightSection={
                <Badge size="sm" variant="light" color={scoreColor(category.score)} circle={false}>
                  {category.score}
                </Badge>
              }
            >
              {category.name}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {categories.map(category => (
          <Tabs.Panel key={category.id} value={category.id}>
            <CategoryDetail category={category} />
          </Tabs.Panel>
        ))}
      </Tabs>
    </Stack>
  );
};

export default Categories;
