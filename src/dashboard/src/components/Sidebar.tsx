import React from 'react';
import { NavLink, Group, Text, Badge, Button } from '@mantine/core';
import { AuditResult } from '@types';
import { exportToPDF } from '../utils/pdfExport';
import './Sidebar.css';

interface SidebarProps {
  currentSection: string;
  onSectionChange: (section: any) => void;
  auditResult: AuditResult | null;
}

const Sidebar: React.FC<SidebarProps> = ({ currentSection, onSectionChange, auditResult }) => {
  const navItems = [
    {
      group: 'Analysis',
      icon: '📊',
      items: [
        { id: 'overview', label: 'Overview', icon: '🏠', badge: auditResult?.overallGrade },
        { id: 'categories', label: 'Categories', icon: '📂', badge: `${auditResult?.categories.length || 0}` },
        { id: 'action-plan', label: 'Action Plan', icon: '✅' },
        { id: 'recommendations', label: 'Recommendations', icon: '💡' },
      ],
    },
    {
      group: 'Insights',
      icon: '🧠',
      items: [
        { id: 'ai-insights', label: 'AI Analysis', icon: '🤖' },
        { id: 'chat', label: 'Ask Claude', icon: '💬' },
      ],
    },
    {
      group: 'Tools',
      icon: '⚙️',
      items: [
        { id: 'progress', label: 'Live Progress', icon: '📈' },
        { id: 'timeline', label: 'Timeline', icon: '📅' },
        { id: 'export', label: 'Export', icon: '📥' },
      ],
    },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="logo-icon">🔍</span>
          <h2>DSAudit</h2>
        </div>
        {auditResult && (
          <div className="audit-info">
            <Text size="xs" c="dimmed" fw={500}>
              Last audit
            </Text>
            <Text size="xs" c="dimmed">
              {new Date(auditResult.timestamp).toLocaleDateString()}
            </Text>
          </div>
        )}
      </div>

      <div className="nav-sections">
        {navItems.map((group) => (
          <div key={group.group} className="nav-group">
            <div className="nav-group-header">
              <span className="group-icon">{group.icon}</span>
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
                    <span className="nav-icon">{item.icon}</span>
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

      {auditResult && (
        <div className="sidebar-footer">
          <Button
            variant="light"
            size="xs"
            onClick={() => exportToPDF(auditResult)}
            className="export-button"
            fullWidth
          >
            <span style={{ marginRight: '0.5rem' }}>📄</span>
            Export PDF Report
          </Button>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
