import React from 'react';
import { NavLink, Group, Text, Badge, Anchor } from '@mantine/core';
import { AuditResult } from '@types';
import {
  BarChart3,
  FolderOpen,
  CheckSquare,
  Lightbulb,
  BrainCircuit,
  MessagesSquare,
  Activity,
  Clock,
  Download
} from 'lucide-react';
import './Sidebar.css';

interface SidebarProps {
  currentSection: string;
  onSectionChange: (section: any) => void;
  auditResult: AuditResult | null;
}

const Sidebar: React.FC<SidebarProps> = ({ currentSection, onSectionChange, auditResult }) => {
  // Extract design system name from project path
  const projectName = auditResult?.projectPath ?
    auditResult.projectPath.split('/').pop() || 'Design System' :
    'Design System';

  const navItems = [
    {
      group: 'Analysis',
      items: [
        { id: 'overview', label: 'Overview', icon: BarChart3, badge: auditResult?.overallGrade },
        { id: 'categories', label: 'Categories', icon: FolderOpen, badge: `${auditResult?.categories.length || 0}` },
        { id: 'action-plan', label: 'Action Plan', icon: CheckSquare },
        { id: 'recommendations', label: 'Recommendations', icon: Lightbulb },
      ],
    },
    {
      group: 'Insights',
      items: [
        { id: 'ai-insights', label: 'AI Analysis', icon: BrainCircuit },
        { id: 'chat', label: 'Ask DSA', icon: MessagesSquare },
      ],
    },
    {
      group: 'Tools',
      items: [
        { id: 'progress', label: 'Live Progress', icon: Activity },
        { id: 'timeline', label: 'Timeline', icon: Clock },
        { id: 'export', label: 'Export', icon: Download },
      ],
    },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <h2>DSAudit</h2>
          <Text size="sm" c="dimmed" fw={500}>
            {projectName}
          </Text>
        </div>
      </div>

      <div className="nav-sections">
        {navItems.map((group) => (
          <div key={group.group} className="nav-group">
            <div className="nav-group-header">
              <Text className="nav-group-title" size="xs" fw={600}>
                {group.group}
              </Text>
            </div>
            {group.items.map((item) => (
              <NavLink
                key={item.id}
                active={currentSection === item.id}
                label={
                  <Group gap="xs">
                    <item.icon size={16} className="nav-icon" />
                    <span className="nav-label">{item.label}</span>
                    {item.badge && (
                      <Badge size="xs" variant="light" className="nav-badge">
                        {item.badge}
                      </Badge>
                    )}
                  </Group>
                }
                onClick={() => {
                  onSectionChange(item.id);
                  window.location.hash = item.id;
                }}
                className="nav-item"
              />
            ))}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        {auditResult && (
          <div className="audit-info">
            <Text size="xs" c="dimmed" fw={500}>
              Last audit: {new Date(auditResult.timestamp).toLocaleString()}
            </Text>
          </div>
        )}
        <div className="footer-link">
          <Text size="xs" c="dimmed">
            Made with ❤️ by{' '}
            <Anchor
              href="https://southleft.com"
              target="_blank"
              size="xs"
              style={{ color: 'var(--text-secondary)' }}
            >
              Southleft
            </Anchor>
          </Text>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
