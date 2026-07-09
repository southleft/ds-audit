import React from 'react';
import {
  Badge,
  Card,
  Code,
  Divider,
  Group,
  List,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Spoiler,
} from '@mantine/core';
import { Sparkles, CheckCircle2 } from 'lucide-react';
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
        <Text size="sm" mb="sm">
          {judge.summary}
        </Text>
      )}

      {(judge.strengths?.length ?? 0) > 0 && (
        <>
          <Text size="sm" fw={600} mb={4}>
            Strengths
          </Text>
          <List
            size="sm"
            spacing={4}
            mb="sm"
            icon={
              <ThemeIcon variant="light" color="green" size="sm" radius="xl">
                <CheckCircle2 size={12} />
              </ThemeIcon>
            }
          >
            {(judge.strengths ?? []).map((strength, i) => (
              <List.Item key={i}>{strength}</List.Item>
            ))}
          </List>
        </>
      )}

      {(judge.issues?.length ?? 0) > 0 && (
        <>
          <Text size="sm" fw={600} mb={4}>
            Issues raised by the AI judge
          </Text>
          <Stack gap="xs" mb="sm">
            {(judge.issues ?? []).map((issue, i) => (
              <Group key={i} align="flex-start" gap="xs" wrap="nowrap">
                <Badge color={SEVERITY_COLORS[issue.severity] ?? 'gray'} size="xs" mt={3}>
                  {issue.severity}
                </Badge>
                <Stack gap={2} style={{ flex: 1 }}>
                  <Text size="sm">{issue.description}</Text>
                  {issue.file && <Code style={{ alignSelf: 'flex-start' }}>{issue.file}</Code>}
                  {issue.suggestion && (
                    <Text size="xs" c="dimmed">
                      Suggestion: {issue.suggestion}
                    </Text>
                  )}
                </Stack>
              </Group>
            ))}
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
