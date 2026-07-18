import React from 'react';
import {
  Badge,
  Card,
  Code,
  Divider,
  Group,
  List,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Spoiler,
} from '@mantine/core';
import { Sparkles, CheckCircle2, Lightbulb } from 'lucide-react';
import type { CategoryResult } from '../types';
import { SEVERITY_COLORS } from '../lib/format';

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'green',
  medium: 'yellow',
  low: 'gray',
};

/**
 * AI judge review for a category: the judge score, confidence, and model
 * alongside the deterministic score it was blended with, plus the judge's
 * summary, strengths, issues, and the evidence files it was shown.
 */
export function JudgePanel({ category }: { category: CategoryResult }) {
  const judge = category.judge;
  if (!judge) return null;

  const deterministic = category.deterministicScore ?? category.score;
  const blended = judge.confidence !== 'low';

  return (
    <Card withBorder radius="md" padding="lg">
      <Group gap="xs" mb="sm">
        <ThemeIcon variant="light" color="grape" size="md" radius="xl">
          <Sparkles size={15} />
        </ThemeIcon>
        <Title order={4}>AI judge review</Title>
        <Badge variant="light" color={CONFIDENCE_COLORS[judge.confidence] ?? 'gray'}>
          {judge.confidence} confidence
        </Badge>
      </Group>

      <Group gap="xl" mb="sm" wrap="wrap">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase">
            Judge score
          </Text>
          <Text fw={700} size="lg">
            {judge.score}/100
          </Text>
        </div>
        <div>
          <Text size="xs" c="dimmed" tt="uppercase">
            Deterministic score
          </Text>
          <Text fw={700} size="lg">
            {deterministic}/100
          </Text>
        </div>
        <div>
          <Text size="xs" c="dimmed" tt="uppercase">
            Final (blended)
          </Text>
          <Text fw={700} size="lg">
            {category.score}/100
          </Text>
        </div>
        <div>
          <Text size="xs" c="dimmed" tt="uppercase">
            Model
          </Text>
          <Code>{judge.model}</Code>
        </div>
      </Group>

      {!blended && (
        <Text size="xs" c="dimmed" mb="sm">
          Low-confidence judgements are not blended — the deterministic score stands alone.
        </Text>
      )}

      {judge.summary && (
        <Text size="sm" lh={1.65} maw="75ch" mb="md">
          {judge.summary}
        </Text>
      )}

      {(judge.strengths?.length ?? 0) > 0 && (
        <>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={8}>
            Strengths
          </Text>
          <List
            size="sm"
            spacing={8}
            mb="md"
            styles={{ itemWrapper: { alignItems: 'flex-start' } }}
            icon={
              <ThemeIcon variant="light" color="green" size="sm" radius="xl">
                <CheckCircle2 size={12} />
              </ThemeIcon>
            }
          >
            {(judge.strengths ?? []).map((strength, i) => (
              <List.Item key={i}>
                <Text size="sm" lh={1.55} maw="72ch">
                  {strength}
                </Text>
              </List.Item>
            ))}
          </List>
        </>
      )}

      {(judge.issues?.length ?? 0) > 0 && (
        <>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={8}>
            Issues raised by the AI judge
          </Text>
          <Stack gap="sm" mb="md">
            {(judge.issues ?? []).map((issue, i) => {
              const color = SEVERITY_COLORS[issue.severity] ?? 'gray';
              return (
                <Paper
                  key={i}
                  withBorder
                  radius="sm"
                  p="sm"
                  style={{ borderLeft: `3px solid var(--mantine-color-${color}-6)` }}
                >
                  <Stack gap={6}>
                    <Group gap="xs" wrap="wrap">
                      <Badge color={color} size="xs">
                        {issue.severity}
                      </Badge>
                      {issue.file && <Code fz="xs">{issue.file}</Code>}
                    </Group>
                    <Text size="sm" lh={1.55} maw="80ch">
                      {issue.description}
                    </Text>
                    {issue.suggestion && (
                      <Group gap={6} wrap="nowrap" align="flex-start">
                        <Lightbulb
                          size={14}
                          style={{ marginTop: 2, flexShrink: 0 }}
                          color="var(--mantine-color-dimmed)"
                        />
                        <Text size="xs" c="dimmed" lh={1.5} maw="80ch">
                          {issue.suggestion}
                        </Text>
                      </Group>
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </>
      )}

      {(judge.evidenceFiles?.length ?? 0) > 0 && (
        <>
          <Divider my="sm" />
          <Text size="xs" c="dimmed" mb={4}>
            Evidence reviewed ({judge.evidenceFiles?.length ?? 0} file
            {(judge.evidenceFiles?.length ?? 0) === 1 ? '' : 's'})
          </Text>
          <Spoiler maxHeight={60} showLabel="Show all evidence files" hideLabel="Hide">
            <Stack gap={2}>
              {(judge.evidenceFiles ?? []).map((file, i) => (
                <Code key={i} style={{ alignSelf: 'flex-start' }}>
                  {file}
                </Code>
              ))}
            </Stack>
          </Spoiler>
        </>
      )}
    </Card>
  );
}
