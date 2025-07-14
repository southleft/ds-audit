import React, { useState } from 'react';
import { Title, Card, Badge, Text, Group, Button, Select, Checkbox, Progress } from '@mantine/core';
import { AuditResult } from '@types';
import './ActionPlan.css';

interface ActionPlanProps {
  auditResult: AuditResult;
}

interface ActionItem {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  effort: 'quick-win' | 'medium' | 'heavy';
  impact: 'high' | 'medium' | 'low';
  completed: boolean;
}

const ActionPlan: React.FC<ActionPlanProps> = ({ auditResult }) => {
  const [filter, setFilter] = useState<string>('all');
  const [actionItems, setActionItems] = useState<ActionItem[]>(() => {
    const items: ActionItem[] = [];
    let id = 0;

    auditResult.categories.forEach(category => {
      category.recommendations?.forEach(rec => {
        items.push({
          id: `${id++}`,
          title: rec.title,
          description: rec.description,
          category: category.name,
          priority: rec.priority,
          effort: rec.effort as any,
          impact: rec.impact as any || 'medium',
          completed: false
        });
      });
    });

    return items.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  });

  const toggleComplete = (id: string) => {
    setActionItems(items =>
      items.map(item =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const filteredItems = filter === 'all' 
    ? actionItems 
    : actionItems.filter(item => {
        if (filter === 'quick-wins') return item.effort === 'quick-win';
        if (filter === 'high-priority') return item.priority === 'high';
        if (filter === 'completed') return item.completed;
        if (filter === 'pending') return !item.completed;
        return true;
      });

  const completedCount = actionItems.filter(item => item.completed).length;
  const completionPercentage = (completedCount / actionItems.length) * 100;

  const getPriorityColor = (priority: string) => {
    return priority === 'high' ? 'red' : priority === 'medium' ? 'yellow' : 'green';
  };

  const getEffortColor = (effort: string) => {
    return effort === 'quick-win' ? 'green' : effort === 'medium' ? 'yellow' : 'red';
  };

  const getImpactColor = (impact: string) => {
    return impact === 'high' ? 'green' : impact === 'medium' ? 'yellow' : 'red';
  };

  return (
    <div className="action-plan-container">
      <Title order={2} mb="xl">Action Plan</Title>

      <Card className="progress-card" mb="xl">
        <Group justify="space-between" mb="md">
          <div>
            <Text size="lg" fw={600}>Overall Progress</Text>
            <Text size="sm" c="dimmed">
              {completedCount} of {actionItems.length} actions completed
            </Text>
          </div>
          <Text size="xl" fw={700} c="blue">
            {Math.round(completionPercentage)}%
          </Text>
        </Group>
        <Progress value={completionPercentage} size="lg" radius="sm" />
      </Card>

      <Group justify="space-between" mb="lg">
        <Select
          value={filter}
          onChange={(value) => setFilter(value || 'all')}
          data={[
            { value: 'all', label: 'All Actions' },
            { value: 'quick-wins', label: 'Quick Wins' },
            { value: 'high-priority', label: 'High Priority' },
            { value: 'pending', label: 'Pending' },
            { value: 'completed', label: 'Completed' }
          ]}
          placeholder="Filter actions"
          style={{ width: 200 }}
        />
        <Text c="dimmed">
          Showing {filteredItems.length} of {actionItems.length} actions
        </Text>
      </Group>

      <div className="action-items-grid">
        {filteredItems.map((item) => (
          <Card
            key={item.id}
            className={`action-item-card ${item.completed ? 'completed' : ''}`}
          >
            <Group justify="space-between" mb="sm">
              <Checkbox
                checked={item.completed}
                onChange={() => toggleComplete(item.id)}
                label={
                  <Text
                    fw={600}
                    style={{
                      textDecoration: item.completed ? 'line-through' : 'none',
                      opacity: item.completed ? 0.6 : 1
                    }}
                  >
                    {item.title}
                  </Text>
                }
              />
              <Badge size="sm" variant="light">
                {item.category}
              </Badge>
            </Group>

            <Text
              size="sm"
              c="dimmed"
              mb="md"
              style={{
                textDecoration: item.completed ? 'line-through' : 'none',
                opacity: item.completed ? 0.6 : 1
              }}
            >
              {item.description}
            </Text>

            <Group gap="xs">
              <Badge color={getPriorityColor(item.priority)} size="sm">
                {item.priority} priority
              </Badge>
              <Badge color={getEffortColor(item.effort)} size="sm" variant="light">
                {item.effort}
              </Badge>
              <Badge color={getImpactColor(item.impact)} size="sm" variant="dot">
                {item.impact} impact
              </Badge>
            </Group>
          </Card>
        ))}
      </div>

      {filteredItems.length === 0 && (
        <Card className="empty-state">
          <Text size="lg" c="dimmed" ta="center">
            No actions match the selected filter
          </Text>
        </Card>
      )}
    </div>
  );
};

export default ActionPlan;