import React from 'react';
import { Group, Stack, Text, Badge } from '@mantine/core';

/**
 * Renders an auditor's `scoreBreakdown` metric — a record of scoring
 * dimension → points (or null when a dimension was not assessable, e.g.
 * build-output size without a build).
 */
export function ScoreBreakdown({
  breakdown,
  labels = {},
}: {
  breakdown: Record<string, unknown> | undefined;
  labels?: Record<string, string>;
}) {
  if (!breakdown || Object.keys(breakdown).length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No score breakdown available in this result.
      </Text>
    );
  }

  return (
    <Stack gap={6}>
      {Object.entries(breakdown).map(([key, value]) => {
        const label =
          labels[key] ??
          key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, c => c.toUpperCase());
        return (
          <Group key={key} justify="space-between" gap="xs">
            <Text size="sm">{label}</Text>
            {typeof value === 'number' ? (
              <Badge variant="light" color="blue">
                {value} pts
              </Badge>
            ) : (
              <Badge variant="light" color="gray">
                not assessed
              </Badge>
            )}
          </Group>
        );
      })}
    </Stack>
  );
}
