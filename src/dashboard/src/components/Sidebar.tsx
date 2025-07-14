import React from 'react';
import { NavLink, Group, Text, Badge } from '@mantine/core';
import { AuditResult } from '@types';
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
      items: [
        { id: 'overview', label: 'Overview', badge: auditResult?.overallGrade },
        { id: 'categories', label: 'Categories', badge: `${auditResult?.categories.length || 0}` },
        { id: 'action-plan', label: 'Action Plan' },
        { id: 'recommendations', label: 'Recommendations' },
      ],
    },
    {
      group: 'Reports',
      items: [
        { id: 'ai-insights', label: 'AI Insights' },
        { id: 'chat', label: 'Chat with Claude' },
      ],
    },
    {
      group: 'System',
      items: [
        { id: 'progress', label: 'Live Progress' },
        { id: 'timeline', label: 'Audit Timeline' },
        { id: 'export', label: 'Export & Download' },
      ],
    },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>DS Audit</h2>
        {auditResult && (
          <Text size="sm" c="dimmed">
            {new Date(auditResult.timestamp).toLocaleDateString()}
          </Text>
        )}
      </div>

      <div className="nav-sections">
        {navItems.map((group) => (
          <div key={group.group} className="nav-group">
            <Text className="nav-group-title" size="xs" fw={700} c="dimmed">
              {group.group}
            </Text>
            {group.items.map((item) => (
              <NavLink
                key={item.id}
                active={currentSection === item.id}
                label={
                  <Group justify="space-between">
                    <span>{item.label}</span>
                    {item.badge && (
                      <Badge size="sm" variant="filled">
                        {item.badge}
                      </Badge>
                    )}
                  </Group>
                }
                onClick={() => onSectionChange(item.id)}
                className="nav-item"
              />
            ))}
          </div>
        ))}
      </div>

      {auditResult && (
        <div className="sidebar-footer">
          <div className="score-summary">
            <Text size="sm" fw={500}>Overall Score</Text>
            <div className="score-display">
              <span className="score-number">{auditResult.overallScore}</span>
              <span className="score-grade">{auditResult.overallGrade}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;