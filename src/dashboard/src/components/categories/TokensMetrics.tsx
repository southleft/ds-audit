import {
  Alert,
  Badge,
  Card,
  Code,
  ColorSwatch,
  Group,
  RingProgress,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { Info } from 'lucide-react';
import type {
  CategoryResult,
  ComponentTokenUsage,
  HardcodedValue,
  TokenCoverageMetrics,
  TokenRedundancy,
} from '../../types';
import { arr, num, rec, str } from '../../lib/metrics';
import { scoreColor } from '../../lib/format';
import { DataTable } from '../shared/DataTable';

/** A style value with a swatch preview when it's a color. */
function ValueCell({ value, isColor }: { value: string; isColor: boolean }) {
  return (
    <Group gap={8} wrap="nowrap">
      {isColor && <ColorSwatch color={value} size={14} radius="sm" withShadow={false} />}
      <Code style={{ whiteSpace: 'nowrap' }}>{value}</Code>
    </Group>
  );
}

function getCoverage(m: Record<string, unknown> | undefined): TokenCoverageMetrics | undefined {
  const coverage = rec(m, 'coverage');
  if (!coverage || typeof coverage.coveragePercentage !== 'number') return undefined;
  return coverage as unknown as TokenCoverageMetrics;
}

export function TokensMetrics({ category }: { category: CategoryResult }) {
  const m = category.metrics;
  const totalTokens = num(m, 'totalTokens');
  const tokenTypes = rec(m, 'tokenTypes');
  const styleDictionary = str(m, 'styleDictionary');
  const sourceFilesScanned = num(m, 'sourceFilesScanned');
  const coverage = getCoverage(m);

  // When a utility-class engine (Tailwind, UnoCSS) is present, tokens are
  // consumed through generated classes at build time — so direct-reference
  // coverage, the "unused" list, and per-component adoption are all
  // low-signal and would mislead. The engine flags this via coverageSignal;
  // honour it here so the UI matches the score and the findings.
  const isUtilityBridge = str(m, 'coverageSignal') === 'utility-bridge';
  const utilityBridge = str(m, 'utilityBridge');

  const componentCoverage = (arr<ComponentTokenUsage>(m, 'componentCoverage') ?? []).filter(
    c => c && typeof c === 'object'
  );
  const hardcodedDetails = (arr<HardcodedValue>(m, 'hardcodedDetails') ?? []).filter(
    h => h && typeof h === 'object'
  );
  const redundancies = (arr<TokenRedundancy>(m, 'redundancies') ?? []).filter(
    r => r && typeof r === 'object' && Array.isArray(r.tokens)
  );

  // Worst coverage first — actionable rows shouldn't be buried by pagination.
  const byCategoryRows = coverage
    ? Object.entries(coverage.byCategory ?? {})
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => (a.percentage ?? 0) - (b.percentage ?? 0))
    : [];

  // Needs-attention components float to the top.
  const componentRows = [...componentCoverage].sort((a, b) => {
    if (!!a.needsAttention !== !!b.needsAttention) return a.needsAttention ? -1 : 1;
    return (a.coverageScore ?? 0) - (b.coverageScore ?? 0);
  });

  return (
    <Stack>
      {/* Inventory — valid regardless of how tokens are consumed. */}
      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="md">
          Token inventory
        </Title>
        <Stack gap={6}>
          <Group justify="space-between">
            <Text size="sm">Tokens defined</Text>
            <Text fw={600}>{coverage?.totalTokens ?? totalTokens ?? '—'}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm">Source files scanned</Text>
            <Text fw={600}>{sourceFilesScanned ?? '—'}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm">Style Dictionary</Text>
            <Badge
              variant="light"
              color={styleDictionary && styleDictionary !== 'not detected' ? 'green' : 'gray'}
            >
              {styleDictionary ?? 'unknown'}
            </Badge>
          </Group>
          {tokenTypes && Object.keys(tokenTypes).length > 0 && (
            <Group gap={6} mt={4}>
              {Object.entries(tokenTypes)
                .filter(([, count]) => typeof count === 'number' && count > 0)
                .map(([type, count]) => (
                  <Badge key={type} variant="light" color="blue">
                    {type}: {String(count)}
                  </Badge>
                ))}
            </Group>
          )}
        </Stack>
      </Card>

      {/* Coverage — meaningful only when tokens are referenced directly. */}
      {isUtilityBridge ? (
        <Alert
          icon={<Info size={18} />}
          color="blue"
          variant="light"
          title="Coverage is measured differently here"
        >
          <Text size="sm">
            {utilityBridge ?? 'A utility-class engine'} consumes design tokens through generated
            utility classes at build time, so direct <Code>var(--token)</Code> references in source
            are sparse by design. Direct-reference coverage is <b>not a reliable adoption signal</b>{' '}
            for this project and is excluded from the token score. The hardcoded-value analysis below
            still applies.
          </Text>
        </Alert>
      ) : (
        <>
          {coverage && (
            <Card withBorder radius="md" padding="lg">
              <Title order={4} mb="md">
                Token coverage
              </Title>
              <Group align="flex-start" gap="xl" wrap="wrap">
                <RingProgress
                  size={140}
                  thickness={12}
                  roundCaps
                  sections={[
                    {
                      value: coverage.coveragePercentage,
                      color: scoreColor(coverage.coveragePercentage),
                    },
                  ]}
                  label={
                    <Text ta="center" fw={700} size="lg">
                      {Math.round(coverage.coveragePercentage)}%
                    </Text>
                  }
                />
                <Stack gap={6} style={{ flex: 1, minWidth: 220 }}>
                  <Group justify="space-between">
                    <Text size="sm">Tokens used in source</Text>
                    <Text fw={600}>{coverage.usedTokens ?? '—'}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Unused tokens</Text>
                    <Text fw={600}>{coverage.unusedTokens?.length ?? '—'}</Text>
                  </Group>
                </Stack>
              </Group>
            </Card>
          )}

          {byCategoryRows.length > 0 && (
            <Card withBorder radius="md" padding="lg">
              <Title order={4} mb="md">
                Coverage by token category
              </Title>
              <DataTable
                columns={[
                  { key: 'name', header: 'Category' },
                  { key: 'total', header: 'Defined', width: 100 },
                  { key: 'used', header: 'Used', width: 100 },
                  {
                    key: 'percentage',
                    header: 'Coverage',
                    width: 140,
                    render: row => (
                      <Badge variant="light" color={scoreColor(row.percentage ?? 0)}>
                        {Math.round(row.percentage ?? 0)}%
                      </Badge>
                    ),
                  },
                ]}
                data={byCategoryRows}
              />
            </Card>
          )}

          {coverage && (coverage.unusedTokens?.length ?? 0) > 0 && (
            <Card withBorder radius="md" padding="lg">
              <Title order={4} mb="md">
                Unused tokens ({coverage.unusedTokens?.length ?? 0})
              </Title>
              <Text size="sm" c="dimmed" mb="sm">
                Defined tokens with no direct reference in source. Some may be intentionally reserved
                for theming or future use.
              </Text>
              <DataTable
                columns={[
                  {
                    key: 'token',
                    header: 'Token',
                    render: row => <Code>{row.token}</Code>,
                  },
                ]}
                data={(coverage.unusedTokens ?? []).map(token => ({ token }))}
                pageSize={15}
                emptyMessage="Every defined token is used at least once."
              />
            </Card>
          )}
        </>
      )}

      {/* Hardcoded values — valid in every mode. */}
      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="md">
          Hardcoded values ({hardcodedDetails.length})
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Style values written directly in source instead of referencing a token. Expand a row to
          see each file and line.
        </Text>
        <DataTable<HardcodedValue>
          columns={[
            {
              key: 'value',
              header: 'Value',
              width: 250,
              render: row => <ValueCell value={row.value} isColor={row.type === 'color'} />,
            },
            { key: 'type', header: 'Type', width: 120 },
            {
              key: 'occurrences',
              header: 'Occurrences',
              width: 120,
              render: row => row.files?.length ?? 0,
            },
            {
              key: 'matchedToken',
              header: 'Closest token',
              render: row =>
                row.matchedToken ? (
                  <Tooltip
                    label={
                      typeof row.similarity === 'number'
                        ? `${Math.round(row.similarity * 100)}% similar`
                        : 'suggested match'
                    }
                  >
                    <Code>{row.matchedToken}</Code>
                  </Tooltip>
                ) : (
                  <Text size="xs" c="dimmed">
                    none
                  </Text>
                ),
            },
          ]}
          data={hardcodedDetails}
          emptyMessage="No hardcoded style values detected."
          expandedContent={row => (
            <Stack gap={4}>
              {(row.files ?? []).slice(0, 25).map((file, i) => (
                <Group key={i} gap="xs" wrap="nowrap">
                  <Code>
                    {file.path}
                    {file.line !== undefined ? `:${file.line}` : ''}
                  </Code>
                  {file.context && (
                    <Text size="xs" c="dimmed" truncate style={{ flex: 1 }}>
                      {file.context}
                    </Text>
                  )}
                </Group>
              ))}
              {(row.files?.length ?? 0) > 25 && (
                <Text size="xs" c="dimmed">
                  …and {(row.files?.length ?? 0) - 25} more occurrences
                </Text>
              )}
            </Stack>
          )}
        />
      </Card>

      {/* Redundant tokens — visually identical or duplicate values. */}
      {redundancies.length > 0 && (
        <Card withBorder radius="md" padding="lg">
          <Title order={4} mb="md">
            Redundant tokens ({redundancies.length})
          </Title>
          <Text size="sm" c="dimmed" mb="sm">
            Sets of tokens with visually identical or duplicate values. Consider consolidating, or
            expressing them as aliases so the relationship is explicit.
          </Text>
          <DataTable<TokenRedundancy>
            columns={[
              {
                key: 'tokens',
                header: 'Tokens',
                render: row => (
                  <Group gap={4} wrap="wrap">
                    {(row.tokens ?? []).map(t => (
                      <Code key={t.name}>{t.name}</Code>
                    ))}
                  </Group>
                ),
              },
              { key: 'type', header: 'Type', width: 110 },
              {
                key: 'value',
                header: 'Value',
                width: 240,
                render: row => (
                  <ValueCell
                    value={row.tokens?.[0]?.value ?? '—'}
                    isColor={row.type === 'color' && !!row.tokens?.[0]?.value}
                  />
                ),
              },
            ]}
            data={redundancies}
            pageSize={10}
          />
        </Card>
      )}

      {/* Per-component adoption — direct-reference only; misleading under a bridge. */}
      {!isUtilityBridge && componentRows.length > 0 && (
        <Card withBorder radius="md" padding="lg">
          <Title order={4} mb="md">
            Token usage by component ({componentRows.length})
          </Title>
          <DataTable<ComponentTokenUsage>
            columns={[
              {
                key: 'componentName',
                header: 'Component',
                render: row => (
                  <Tooltip label={row.componentPath ?? ''} disabled={!row.componentPath}>
                    <Text size="sm" fw={500}>
                      {row.componentName ?? row.componentPath ?? '—'}
                    </Text>
                  </Tooltip>
                ),
              },
              {
                key: 'tokensUsed',
                header: 'Tokens used',
                width: 110,
                render: row => row.tokensUsed?.length ?? 0,
              },
              {
                key: 'hardcodedValues',
                header: 'Hardcoded',
                width: 100,
                render: row => row.hardcodedValues ?? 0,
              },
              {
                key: 'coverageScore',
                header: 'Coverage',
                width: 110,
                render: row =>
                  typeof row.coverageScore === 'number' ? (
                    <Badge variant="light" color={scoreColor(row.coverageScore)}>
                      {Math.round(row.coverageScore)}%
                    </Badge>
                  ) : (
                    '—'
                  ),
              },
              {
                key: 'needsAttention',
                header: 'Status',
                width: 130,
                render: row =>
                  row.needsAttention ? (
                    <Tooltip
                      label={(row.attentionReasons ?? []).join('; ') || 'Needs attention'}
                      multiline
                      maw={320}
                    >
                      <Badge color="orange" variant="light">
                        needs attention
                      </Badge>
                    </Tooltip>
                  ) : (
                    <Badge color="green" variant="light">
                      ok
                    </Badge>
                  ),
              },
            ]}
            data={componentRows}
            emptyMessage="No per-component usage data in this result."
            expandedContent={row => (
              <Group gap={4}>
                {(row.tokensUsed ?? []).length > 0 ? (
                  (row.tokensUsed ?? []).map(token => (
                    <Badge key={token} variant="light" color="blue" size="sm">
                      {token}
                    </Badge>
                  ))
                ) : (
                  <Text size="xs" c="dimmed">
                    No tokens referenced by this component.
                  </Text>
                )}
              </Group>
            )}
          />
        </Card>
      )}
    </Stack>
  );
}
