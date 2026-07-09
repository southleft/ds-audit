import React from 'react';
import { Badge, Group, NavLink, Stack, Text, Divider } from '@mantine/core';
import {
  Activity,
  ClipboardList,
  Download,
  LayoutDashboard,
  ListChecks,
} from 'lucide-react';
import type { AuditResult } from '../types';
import { scoreColor } from '../lib/format';

export type Section = 'overview' | 'categories' | 'action-plan' | 'progress' | 'export';

interface SidebarProps {
  currentSection: Section;
  onSectionChange: (section: Section) => void;
  auditResult: AuditResult | null;
}

const NAV_ITEMS: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={17} /> },
  { id: 'categories', label: 'Categories', icon: <ListChecks size={17} /> },
  { id: 'action-plan', label: 'Action Plan', icon: <ClipboardList size={17} /> },
  { id: 'progress', label: 'Live Progress', icon: <Activity size={17} /> },
  { id: 'export', label: 'Export', icon: <Download size={17} /> },
];

const Sidebar: React.FC<SidebarProps> = ({ currentSection, onSectionChange, auditResult }) => {
  const hasResults = Boolean(auditResult && auditResult.categories?.length > 0);
  const projectName =
    auditResult?.projectPath
      ?.split('/')
      .filter(segment => segment && segment !== '.' && segment !== '..')
      .pop() || null;

  return (
    <Stack gap={0} h="100%" p="md" justify="space-between">
      <div>
        <Group gap="xs" mb={4}>
          <Text fw={800} size="lg">
            dsaudit
          </Text>
        </Group>
        <Text size="xs" c="dimmed" mb="md" truncate>
          {projectName ?? 'Design system audit'}
        </Text>

        {hasResults && auditResult && (
          <Group gap="xs" mb="md">
            <Badge
              color={scoreColor(auditResult.overallScore)}
              variant="filled"
              size="lg"
            >
              {auditResult.overallScore} · {auditResult.overallGrade}
            </Badge>
            {auditResult.partial && (
              <Badge color="orange" variant="light" size="lg">
                PARTIAL
              </Badge>
            )}
          </Group>
        )}

        <Divider mb="sm" />

        <Stack gap={4}>
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.id}
              active={currentSection === item.id}
              label={item.label}
              leftSection={item.icon}
              onClick={() => onSectionChange(item.id)}
              style={{ borderRadius: 8 }}
            />
          ))}
        </Stack>
      </div>

      {hasResults && auditResult && (
        <Text size="xs" c="dimmed">
          Last audit: {new Date(auditResult.timestamp).toLocaleString()}
        </Text>
      )}
    </Stack>
  );
};

export default Sidebar;
