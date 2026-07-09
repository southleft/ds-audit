import React, { useState } from 'react';
import { Accordion, Badge, Group, Stack, Text, Code, Button, ThemeIcon } from '@mantine/core';
import { AlertTriangle, CheckCircle2, Info, XCircle, Sparkles } from 'lucide-react';
import type { Finding } from '../types';
import { SEVERITY_COLORS, SEVERITY_ORDER, isJudgeFinding } from '../lib/format';

const PAGE = 15;

function typeIcon(finding: Finding) {
  switch (finding.type) {
    case 'success':
      return (
        <ThemeIcon variant="light" color="green" size="sm" radius="xl">
          <CheckCircle2 size={13} />
        </ThemeIcon>
      );
    case 'error':
      return (
        <ThemeIcon variant="light" color="red" size="sm" radius="xl">
          <XCircle size={13} />
        </ThemeIcon>
      );
    case 'warning':
      return (
        <ThemeIcon variant="light" color="orange" size="sm" radius="xl">
          <AlertTriangle size={13} />
        </ThemeIcon>
      );
    default:
      return (
        <ThemeIcon variant="light" color="blue" size="sm" radius="xl">
          <Info size={13} />
        </ThemeIcon>
      );
  }
}

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <Group align="flex-start" gap="sm" wrap="nowrap">
      {typeIcon(finding)}
      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
        <Group gap="xs">
          <Text size="sm" style={{ flex: 1 }}>
            {finding.message}
          </Text>
          {isJudgeFinding(finding) && (
            <Badge
              variant="light"
              color="grape"
              size="xs"
              leftSection={<Sparkles size={10} />}
            >
              AI judge
            </Badge>
          )}
        </Group>
        {finding.path && (
          <Code style={{ alignSelf: 'flex-start' }}>
            {finding.path}
            {finding.line !== undefined ? `:${finding.line}` : ''}
          </Code>
        )}
        {finding.suggestion && (
          <Text size="xs" c="dimmed">
            Suggestion: {finding.suggestion}
          </Text>
        )}
      </Stack>
    </Group>
  );
}

/** A severity group with local "show more" pagination. */
function SeverityGroup({ findings }: { findings: Finding[] }) {
  const [limit, setLimit] = useState(PAGE);
  const visible = findings.slice(0, limit);

  return (
    <Stack gap="sm">
      {visible.map(finding => (
        <FindingRow key={finding.id} finding={finding} />
      ))}
      {findings.length > limit && (
        <Button variant="subtle" size="xs" onClick={() => setLimit(l => l + PAGE)}>
          Show {Math.min(PAGE, findings.length - limit)} more of {findings.length - limit} remaining
        </Button>
      )}
    </Stack>
  );
}

/**
 * Findings grouped by severity (critical → low), with successes ("what's
 * working") in their own group at the end. Judge-originated findings are
 * badged.
 */
export function FindingsList({ findings }: { findings: Finding[] }) {
  if (!findings || findings.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No findings recorded for this category.
      </Text>
    );
  }

  const issues = findings.filter(f => f.type !== 'success');
  const successes = findings.filter(f => f.type === 'success');

  const groups = SEVERITY_ORDER.map(severity => ({
    severity,
    items: issues.filter(f => f.severity === severity),
  })).filter(g => g.items.length > 0);

  const defaultOpen = [
    ...groups.filter(g => g.severity === 'critical' || g.severity === 'high').map(g => g.severity),
  ];

  return (
    <Accordion multiple defaultValue={defaultOpen} variant="separated">
      {groups.map(group => (
        <Accordion.Item key={group.severity} value={group.severity}>
          <Accordion.Control>
            <Group gap="xs">
              <Badge color={SEVERITY_COLORS[group.severity]} variant="filled" size="sm">
                {group.severity}
              </Badge>
              <Text size="sm" fw={500}>
                {group.items.length} finding{group.items.length === 1 ? '' : 's'}
              </Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <SeverityGroup findings={group.items} />
          </Accordion.Panel>
        </Accordion.Item>
      ))}

      {successes.length > 0 && (
        <Accordion.Item value="success">
          <Accordion.Control>
            <Group gap="xs">
              <Badge color="green" variant="filled" size="sm">
                passing
              </Badge>
              <Text size="sm" fw={500}>
                {successes.length} check{successes.length === 1 ? '' : 's'} passing
              </Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <SeverityGroup findings={successes} />
          </Accordion.Panel>
        </Accordion.Item>
      )}
    </Accordion>
  );
}
