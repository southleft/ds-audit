import { Alert, Badge, Card, Group, Progress, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Bot, Check, X } from 'lucide-react';
import type { CategoryResult } from '../../types';
import { num, rec } from '../../lib/metrics';
import { scoreColor } from '../../lib/format';
import { ScoreBreakdown } from '../shared/ScoreBreakdown';

/** Artifact checklist entries in display order, with human labels and the
 * reason each artifact matters to an AI consumer. */
const ARTIFACT_ROWS: { key: string; label: string; hint: string }[] = [
  {
    key: 'agentInstructions',
    label: 'Agent instructions (CLAUDE.md / AGENTS.md)',
    hint: 'Project-level guidance AI assistants load automatically',
  },
  {
    key: 'editorRules',
    label: 'Editor rules (.cursorrules / copilot-instructions)',
    hint: 'Conventions for in-editor assistants',
  },
  {
    key: 'llmsTxt',
    label: 'llms.txt',
    hint: 'Curated documentation entry point for LLM context loaders',
  },
  {
    key: 'mcpConfig',
    label: 'MCP configuration',
    hint: 'Lets agents query the system at runtime',
  },
  {
    key: 'componentMetadata',
    label: 'Component metadata (custom-elements.json / *.meta.json)',
    hint: 'Machine-enumerable component API',
  },
  {
    key: 'exportsMap',
    label: 'package.json exports map',
    hint: 'Reliable public entry-point resolution',
  },
  {
    key: 'typesEntry',
    label: 'Type declarations entry',
    hint: 'The primary machine-readable API contract',
  },
  { key: 'barrelExport', label: 'Barrel export (src/index)', hint: 'One predictable import path' },
  {
    key: 'strictTypescript',
    label: 'TypeScript strict mode',
    hint: 'Misuse fails to compile instead of shipping',
  },
  {
    key: 'sharedLintConfig',
    label: 'Shareable lint config',
    hint: 'Consumers inherit design system rules',
  },
  {
    key: 'changelogMachinery',
    label: 'Changelog / changesets',
    hint: 'Machine-parseable API version history',
  },
];

function CoverageRow({ label, value }: { label: string; value: number | undefined }) {
  if (value === undefined) return null;
  return (
    <div>
      <Group justify="space-between" mb={4}>
        <Text size="sm">{label}</Text>
        <Text size="sm" fw={600}>
          {value}%
        </Text>
      </Group>
      <Progress value={value} color={scoreColor(value)} size="md" radius="sm" />
    </div>
  );
}

export function AIReadinessMetrics({ category }: { category: CategoryResult }) {
  const m = category.metrics;
  const artifacts = rec(m, 'artifacts');
  const componentCount = num(m, 'componentCount');
  const breakdown = rec(m, 'scoreBreakdown');

  return (
    <Stack>
      <Alert icon={<Bot size={18} />} color="teal" variant="light" title="Experimental category">
        <Text size="sm">
          Measures how reliably an AI coding assistant could consume this design system correctly
          from its public artifacts alone — treating the system as an API whose primary consumer is
          an agent. Reported for insight; not counted in the overall score.
        </Text>
      </Alert>

      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="md">
          Machine-consumable artifacts
        </Title>
        <Stack gap={8}>
          {ARTIFACT_ROWS.map(row => {
            const present = artifacts?.[row.key] === true;
            return (
              <Group key={row.key} gap="sm" wrap="nowrap" align="flex-start">
                <Badge
                  variant="light"
                  color={present ? 'green' : 'red'}
                  leftSection={present ? <Check size={12} /> : <X size={12} />}
                  style={{ flexShrink: 0, minWidth: 84 }}
                >
                  {present ? 'present' : 'missing'}
                </Badge>
                <div>
                  <Text size="sm" fw={500}>
                    {row.label}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {row.hint}
                  </Text>
                </div>
              </Group>
            );
          })}
        </Stack>
      </Card>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder radius="md" padding="lg">
          <Title order={4} mb="md">
            Contract quality
          </Title>
          <Text size="sm" c="dimmed" mb="sm">
            {componentCount ?? '—'} components analyzed. The props contract is the API documentation
            an assistant consumes.
          </Text>
          <Stack gap="sm">
            <CoverageRow label="Components with a props contract" value={num(m, 'propContractCoverage')} />
            <CoverageRow label="Contracts with JSDoc descriptions" value={num(m, 'jsdocCoverage')} />
            <CoverageRow label="Contracts free of `any`" value={num(m, 'anyFreeContracts')} />
            <CoverageRow label="Contracts using constrained unions" value={num(m, 'unionTypedContracts')} />
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Title order={4} mb="md">
            Examples & score breakdown
          </Title>
          <Stack gap="sm" mb="md">
            <CoverageRow label="Story coverage" value={num(m, 'storyCoverage')} />
            <Group justify="space-between">
              <Text size="sm">Doc code snippets</Text>
              <Text fw={600}>{num(m, 'docSnippetCount') ?? '—'}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm">Test files</Text>
              <Text fw={600}>{num(m, 'testFileCount') ?? '—'}</Text>
            </Group>
          </Stack>
          <ScoreBreakdown
            breakdown={breakdown}
            labels={{
              contractQuality: 'Contract quality (25)',
              discoverability: 'Discoverability (15)',
              agentGuidance: 'Agent guidance (25)',
              exampleDensity: 'Example density (20)',
              guardrails: 'Guardrails (15)',
            }}
          />
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
