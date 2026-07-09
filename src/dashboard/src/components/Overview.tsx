import React from 'react';
import {
  Alert,
  Badge,
  Card,
  Group,
  List,
  Progress,
  RingProgress,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileSearch,
  Layers,
  ListChecks,
  Sparkles,
} from 'lucide-react';
import type { AuditResult } from '../types';
import { categoryLabel, formatDuration, formatWeight, scoreColor } from '../lib/format';

interface OverviewProps {
  auditResult: AuditResult;
  onSelectCategory: (categoryId: string) => void;
  onNavigate: (section: 'action-plan') => void;
}

function StatCard({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Card
      withBorder
      radius="md"
      padding="md"
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <Group gap="sm" wrap="nowrap">
        <ThemeIcon variant="light" color="blue" size="lg" radius="md">
          {icon}
        </ThemeIcon>
        <div style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed" tt="uppercase">
            {label}
          </Text>
          <Text fw={700} size="lg" truncate>
            {value}
          </Text>
        </div>
      </Group>
    </Card>
  );
}

const Overview: React.FC<OverviewProps> = ({ auditResult, onSelectCategory, onNavigate }) => {
  const { overallScore, overallGrade, partial, categories, metadata } = auditResult;
  const failedCategories = metadata?.failedCategories ?? [];
  const frameworks = metadata?.frameworksDetected ?? [];
  const tools = metadata?.toolsDetected ?? [];
  const judgedCount = categories?.filter(c => c.judge).length ?? 0;

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Overview</Title>
        <Text c="dimmed" size="sm">
          {auditResult.projectPath} — audited {new Date(auditResult.timestamp).toLocaleString()}
        </Text>
      </div>

      {partial && (
        <Alert
          color="orange"
          variant="light"
          icon={<AlertTriangle size={18} />}
          title="Partial audit result"
        >
          <Text size="sm" mb={failedCategories.length > 0 ? 6 : 0}>
            One or more enabled categories failed to run. The overall score covers only the
            categories that completed.
          </Text>
          {failedCategories.length > 0 && (
            <List size="sm" spacing={2}>
              {failedCategories.map(failure => (
                <List.Item key={failure.id}>
                  <strong>{categoryLabel(auditResult, failure.id)}</strong>: {failure.error}
                </List.Item>
              ))}
            </List>
          )}
        </Alert>
      )}

      {/* Score hero */}
      <Card withBorder radius="md" padding="xl">
        <Group gap="xl" wrap="wrap" align="center">
          <RingProgress
            size={170}
            thickness={14}
            roundCaps
            sections={[{ value: overallScore, color: scoreColor(overallScore) }]}
            label={
              <Stack gap={0} align="center">
                <Text fw={800} style={{ fontSize: 38, lineHeight: 1 }}>
                  {overallScore}
                </Text>
                <Text size="xs" c="dimmed">
                  / 100
                </Text>
              </Stack>
            }
          />
          <Stack gap="xs" style={{ flex: 1, minWidth: 220 }}>
            <Group gap="sm">
              <Title order={2}>Grade {overallGrade}</Title>
              {partial && (
                <Badge color="orange" variant="filled" size="lg">
                  PARTIAL
                </Badge>
              )}
            </Group>
            <Text size="sm" c="dimmed">
              Weighted across {categories?.length ?? 0} audited categor
              {categories?.length === 1 ? 'y' : 'ies'}
              {judgedCount > 0 &&
                ` — ${judgedCount} reviewed by the AI judge and blended with deterministic scores`}
              .
            </Text>
            {frameworks.length > 0 && (
              <Group gap={6}>
                {frameworks.map(fw => (
                  <Badge key={fw} variant="light" color="blue">
                    {fw}
                  </Badge>
                ))}
              </Group>
            )}
          </Stack>
        </Group>
      </Card>

      {/* Quick stats */}
      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <StatCard
          icon={<FileSearch size={18} />}
          label="Files scanned"
          value={metadata?.filesScanned ?? '—'}
        />
        <StatCard
          icon={<Clock size={18} />}
          label="Duration"
          value={formatDuration(metadata?.duration)}
        />
        <StatCard
          icon={<Layers size={18} />}
          label="Categories"
          value={categories?.length ?? 0}
        />
        <StatCard
          icon={<ListChecks size={18} />}
          label="Recommendations"
          value={auditResult.recommendations?.length ?? 0}
          onClick={
            (auditResult.recommendations?.length ?? 0) > 0
              ? () => onNavigate('action-plan')
              : undefined
          }
        />
      </SimpleGrid>

      {/* AI insights (only when the judge produced them — never canned) */}
      {auditResult.aiInsights && (
        <Card withBorder radius="md" padding="lg">
          <Group gap="xs" mb="sm">
            <ThemeIcon variant="light" color="grape" size="md" radius="xl">
              <Sparkles size={15} />
            </ThemeIcon>
            <Title order={4}>AI insights</Title>
          </Group>
          {auditResult.aiInsights.summary && (
            <Text size="sm" mb="sm">
              {auditResult.aiInsights.summary}
            </Text>
          )}
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {auditResult.aiInsights.strengths?.length > 0 && (
              <div>
                <Text size="sm" fw={600} mb={4}>
                  Strengths
                </Text>
                <List
                  size="sm"
                  spacing={4}
                  icon={
                    <ThemeIcon variant="light" color="green" size="sm" radius="xl">
                      <CheckCircle2 size={12} />
                    </ThemeIcon>
                  }
                >
                  {auditResult.aiInsights.strengths.map((item, i) => (
                    <List.Item key={i}>{item}</List.Item>
                  ))}
                </List>
              </div>
            )}
            {auditResult.aiInsights.improvements?.length > 0 && (
              <div>
                <Text size="sm" fw={600} mb={4}>
                  Improvements
                </Text>
                <List
                  size="sm"
                  spacing={4}
                  icon={
                    <ThemeIcon variant="light" color="orange" size="sm" radius="xl">
                      <ArrowUpRight size={12} />
                    </ThemeIcon>
                  }
                >
                  {auditResult.aiInsights.improvements.map((item, i) => (
                    <List.Item key={i}>{item}</List.Item>
                  ))}
                </List>
              </div>
            )}
          </SimpleGrid>
        </Card>
      )}

      {/* Category score bars */}
      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="md">
          Category scores
        </Title>
        {categories && categories.length > 0 ? (
          <Stack gap="md">
            {categories.map(category => (
              <UnstyledButton
                key={category.id}
                onClick={() => onSelectCategory(category.id)}
                aria-label={`Open ${category.name} details`}
              >
                <Group justify="space-between" mb={4}>
                  <Group gap="xs">
                    <Text size="sm" fw={600}>
                      {category.name}
                    </Text>
                    <Badge size="xs" variant="light" color="gray">
                      weight {formatWeight(category.weight)}
                    </Badge>
                    {category.judge && (
                      <Badge size="xs" variant="light" color="grape">
                        AI judged
                      </Badge>
                    )}
                  </Group>
                  <Group gap="xs">
                    <Text size="sm" fw={700}>
                      {category.score}
                    </Text>
                    <Badge size="sm" color={scoreColor(category.score)} variant="filled">
                      {category.grade}
                    </Badge>
                  </Group>
                </Group>
                <Progress
                  value={category.score}
                  color={scoreColor(category.score)}
                  size="lg"
                  radius="sm"
                />
              </UnstyledButton>
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            No category results yet.
          </Text>
        )}
      </Card>

      {/* External design system */}
      {auditResult.externalDesignSystem?.detected && (
        <Card withBorder radius="md" padding="lg">
          <Title order={4} mb="sm">
            External design system detected
          </Title>
          <Group gap={6} mb="xs">
            {auditResult.externalDesignSystem.systems.map(system => (
              <Badge key={system.packageName} variant="light" color="teal">
                {system.name}
                {system.version ? ` ${system.version}` : ''}
              </Badge>
            ))}
            <Badge variant="outline" color="gray">
              {auditResult.externalDesignSystem.mode}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            {auditResult.externalDesignSystem.scoringAdjustment.reason}
          </Text>
        </Card>
      )}

      {/* Detected tools */}
      {tools.length > 0 && (
        <Card withBorder radius="md" padding="lg">
          <Title order={4} mb="sm">
            Tools detected
          </Title>
          <Group gap={6}>
            {tools.map(tool => (
              <Badge key={tool} variant="light" color="gray">
                {tool}
              </Badge>
            ))}
          </Group>
        </Card>
      )}
    </Stack>
  );
};

export default Overview;
