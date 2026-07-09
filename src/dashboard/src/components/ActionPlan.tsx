import React, { useMemo, useState } from 'react';
import {
  Badge,
  Card,
  Divider,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { Wrench } from 'lucide-react';
import type { AuditResult, Recommendation } from '../types';
import {
  categoryLabel,
  EFFORT_COLORS,
  EFFORT_LABELS,
  IMPACT_COLORS,
  PRIORITY_COLORS,
} from '../lib/format';

interface ActionPlanProps {
  auditResult: AuditResult;
}

const PRIORITY_ORDER = ['high', 'medium', 'low'] as const;

const PRIORITY_TITLES: Record<string, string> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

function RecommendationCard({
  recommendation,
  auditResult,
}: {
  recommendation: Recommendation;
  auditResult: AuditResult;
}) {
  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" align="flex-start" mb={4} wrap="nowrap">
        <Text fw={600} size="sm" style={{ flex: 1 }}>
          {recommendation.title}
        </Text>
        <Group gap={6} wrap="nowrap">
          <Badge size="sm" variant="light" color={EFFORT_COLORS[recommendation.effort] ?? 'gray'}>
            {EFFORT_LABELS[recommendation.effort] ?? recommendation.effort}
          </Badge>
          <Badge size="sm" variant="light" color={IMPACT_COLORS[recommendation.impact] ?? 'gray'}>
            {recommendation.impact} impact
          </Badge>
        </Group>
      </Group>

      <Text size="sm" c="dimmed" mb={6}>
        {recommendation.description}
      </Text>

      <Group justify="space-between" align="flex-end">
        <Badge size="xs" variant="outline" color="gray">
          {categoryLabel(auditResult, recommendation.category)}
        </Badge>
      </Group>

      {recommendation.implementation && (
        <>
          <Divider my="sm" />
          <Group gap={6} align="flex-start" wrap="nowrap">
            <Wrench size={14} style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                Implementation guidance
              </Text>
              <Text size="sm">{recommendation.implementation}</Text>
            </div>
          </Group>
        </>
      )}
    </Card>
  );
}

/**
 * Purely data-driven action plan built from `results.recommendations` —
 * grouped by priority, filterable by category and effort. Effort labels are
 * the engine's honest enum; no invented hour estimates.
 */
const ActionPlan: React.FC<ActionPlanProps> = ({ auditResult }) => {
  const recommendations = auditResult.recommendations ?? [];
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [effortFilter, setEffortFilter] = useState<string>('all');

  const categoryOptions = useMemo(() => {
    const ids = Array.from(new Set(recommendations.map(r => r.category))).sort();
    return ids.map(id => ({ value: id, label: categoryLabel(auditResult, id) }));
  }, [recommendations, auditResult]);

  const filtered = recommendations.filter(rec => {
    if (categoryFilter && rec.category !== categoryFilter) return false;
    if (effortFilter !== 'all' && rec.effort !== effortFilter) return false;
    return true;
  });

  const groups = PRIORITY_ORDER.map(priority => ({
    priority,
    items: filtered.filter(r => r.priority === priority),
  })).filter(g => g.items.length > 0);

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Action Plan</Title>
        <Text c="dimmed" size="sm">
          {recommendations.length} recommendation{recommendations.length === 1 ? '' : 's'}{' '}
          generated from audit findings, ordered by priority
        </Text>
      </div>

      {recommendations.length === 0 ? (
        <Card withBorder radius="md" padding="lg">
          <Text size="sm" c="dimmed">
            No recommendations — the audit found no issues that warrant action, or no audit has
            run yet.
          </Text>
        </Card>
      ) : (
        <>
          <Group gap="md" align="flex-end" wrap="wrap">
            <Select
              label="Category"
              placeholder="All categories"
              data={categoryOptions}
              value={categoryFilter}
              onChange={setCategoryFilter}
              clearable
              w={220}
            />
            <div>
              <Text size="sm" fw={500} mb={4}>
                Effort
              </Text>
              <SegmentedControl
                value={effortFilter}
                onChange={setEffortFilter}
                data={[
                  { value: 'all', label: 'All' },
                  { value: 'quick-win', label: 'Quick win' },
                  { value: 'medium-lift', label: 'Medium lift' },
                  { value: 'heavy-lift', label: 'Heavy lift' },
                ]}
              />
            </div>
          </Group>

          {groups.length === 0 && (
            <Text size="sm" c="dimmed">
              No recommendations match the current filters.
            </Text>
          )}

          {groups.map(group => (
            <div key={group.priority}>
              <Group gap="xs" mb="sm">
                <Badge color={PRIORITY_COLORS[group.priority]} variant="filled">
                  {PRIORITY_TITLES[group.priority]}
                </Badge>
                <Text size="sm" c="dimmed">
                  {group.items.length} item{group.items.length === 1 ? '' : 's'}
                </Text>
              </Group>
              <Stack gap="sm">
                {group.items.map(rec => (
                  <RecommendationCard key={rec.id} recommendation={rec} auditResult={auditResult} />
                ))}
              </Stack>
            </div>
          ))}
        </>
      )}
    </Stack>
  );
};

export default ActionPlan;
