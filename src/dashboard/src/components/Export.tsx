import React, { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { Copy, Download, ExternalLink, FileText } from 'lucide-react';
import type { AuditResult } from '../types';
import { exportData, type ExportFormat } from '../utils/dataExport';

interface ExportProps {
  auditResult: AuditResult;
}

const EXPORT_FORMATS: Array<{ value: ExportFormat; label: string; description: string }> = [
  { value: 'json', label: 'JSON', description: 'Complete audit data, exactly as produced by the engine' },
  { value: 'csv', label: 'CSV', description: 'Category scores in spreadsheet format' },
  { value: 'markdown', label: 'Markdown', description: 'Formatted report with findings and recommendations' },
];

/** Availability-checked link to a server-generated audit file. */
function QuickLink({ label, path }: { label: string; path: string }) {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(path, { method: 'HEAD' })
      .then(res => {
        if (!cancelled) setAvailable(res.ok);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div>
      <Group justify="space-between" mb={2}>
        <Text size="sm" fw={500}>
          {label}
        </Text>
        {available === null ? (
          <Badge size="sm" color="gray" variant="light">
            checking…
          </Badge>
        ) : (
          <Badge size="sm" color={available ? 'green' : 'red'} variant="light">
            {available ? 'Available' : 'Not found'}
          </Badge>
        )}
      </Group>
      <Text size="xs" c="dimmed" mb={6}>
        {path}
      </Text>
      <Button
        size="xs"
        variant="light"
        fullWidth
        leftSection={<ExternalLink size={13} />}
        disabled={available === false}
        onClick={() => window.open(path, '_blank')}
      >
        Open
      </Button>
    </div>
  );
}

const Export: React.FC<ExportProps> = ({ auditResult }) => {
  const [format, setFormat] = useState<ExportFormat>('json');
  const [copied, setCopied] = useState(false);

  const copySummary = async () => {
    const summary =
      `Design System Audit Summary\n` +
      `Date: ${new Date(auditResult.timestamp).toLocaleDateString()}\n` +
      `Project: ${auditResult.projectPath}\n` +
      `Score: ${auditResult.overallScore}/100 (Grade ${auditResult.overallGrade})` +
      (auditResult.partial ? ' — PARTIAL RESULT' : '') +
      `\n` +
      (auditResult.categories ?? [])
        .map(c => `  ${c.name}: ${c.score}/100 (${c.grade})`)
        .join('\n');
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Stack gap="md" maw={960}>
      <div>
        <Title order={2}>Export</Title>
        <Text c="dimmed" size="sm">
          Download the audit data or open the server-generated reports
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder radius="md" padding="lg">
          <Group gap="xs" mb="sm">
            <FileText size={18} />
            <Title order={4}>Data export</Title>
          </Group>
          <Text size="sm" c="dimmed" mb="md">
            Export the current results for further analysis or sharing.
          </Text>

          <Select
            label="Format"
            value={format}
            onChange={value => setFormat((value as ExportFormat) ?? 'json')}
            data={EXPORT_FORMATS.map(f => ({ value: f.value, label: f.label }))}
            allowDeselect={false}
            mb="xs"
          />
          <Text size="xs" c="dimmed" mb="md">
            {EXPORT_FORMATS.find(f => f.value === format)?.description}
          </Text>

          <Button
            fullWidth
            leftSection={<Download size={15} />}
            onClick={() => exportData(auditResult, format)}
          >
            Download {format.toUpperCase()}
          </Button>
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Group gap="xs" mb="sm">
            <ExternalLink size={18} />
            <Title order={4}>Generated reports</Title>
          </Group>
          <Text size="sm" c="dimmed" mb="md">
            Files written by the audit into the configured output directory.
          </Text>
          <Stack gap="md">
            <QuickLink label="Markdown report" path="/audit/report.md" />
            <QuickLink label="JSON results" path="/audit/results.json" />
          </Stack>
        </Card>
      </SimpleGrid>

      <Card withBorder radius="md" padding="lg">
        <Title order={4} mb="sm">
          Snapshot
        </Title>
        <SimpleGrid cols={{ base: 2, sm: 5 }} mb="md">
          <div>
            <Text size="xs" c="dimmed" tt="uppercase">
              Audit date
            </Text>
            <Text size="sm" fw={600}>
              {new Date(auditResult.timestamp).toLocaleDateString()}
            </Text>
          </div>
          <div>
            <Text size="xs" c="dimmed" tt="uppercase">
              Score
            </Text>
            <Text size="sm" fw={600}>
              {auditResult.overallScore}/100{auditResult.partial ? ' (partial)' : ''}
            </Text>
          </div>
          <div>
            <Text size="xs" c="dimmed" tt="uppercase">
              Categories
            </Text>
            <Text size="sm" fw={600}>
              {auditResult.categories?.length ?? 0}
            </Text>
          </div>
          <div>
            <Text size="xs" c="dimmed" tt="uppercase">
              Files scanned
            </Text>
            <Text size="sm" fw={600}>
              {auditResult.metadata?.filesScanned ?? '—'}
            </Text>
          </div>
          <div>
            <Text size="xs" c="dimmed" tt="uppercase">
              Recommendations
            </Text>
            <Text size="sm" fw={600}>
              {auditResult.recommendations?.length ?? 0}
            </Text>
          </div>
        </SimpleGrid>
        <Button
          variant="light"
          leftSection={<Copy size={15} />}
          onClick={copySummary}
        >
          {copied ? 'Copied!' : 'Copy summary to clipboard'}
        </Button>
      </Card>
    </Stack>
  );
};

export default Export;
