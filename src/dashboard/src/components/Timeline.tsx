import React, { useState, useEffect } from 'react';
import { Title, Card, Text, Badge, Timeline as MantineTimeline, Group, Select, Button, ScrollArea } from '@mantine/core';
import { AuditResult } from '@types';
import './Timeline.css';

interface TimelineProps {
  auditResult: AuditResult;
}

interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'start' | 'scan' | 'complete' | 'error' | 'info';
  category?: string;
  message: string;
  details?: string;
  duration?: number;
}

const Timeline: React.FC<TimelineProps> = ({ auditResult }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    // Generate timeline from audit result
    const timeline: LogEntry[] = [];
    const startTime = new Date(auditResult.timestamp);
    let currentTime = startTime.getTime();

    // Audit start
    timeline.push({
      id: '0',
      timestamp: new Date(currentTime),
      type: 'start',
      message: 'Design system audit started',
      details: `Project: ${auditResult.projectPath}`
    });

    // File scanning
    currentTime += 2000;
    timeline.push({
      id: '1',
      timestamp: new Date(currentTime),
      type: 'scan',
      message: `Scanning ${auditResult.metadata.filesScanned} files`,
      details: 'Analyzing project structure and dependencies'
    });

    // Tool detection
    if (auditResult.metadata.toolsDetected.length > 0) {
      currentTime += 1500;
      timeline.push({
        id: '2',
        timestamp: new Date(currentTime),
        type: 'info',
        message: 'Detected development tools',
        details: auditResult.metadata.toolsDetected.join(', ')
      });
    }

    // Framework detection
    if (auditResult.metadata.frameworksDetected.length > 0) {
      currentTime += 1000;
      timeline.push({
        id: '3',
        timestamp: new Date(currentTime),
        type: 'info',
        message: 'Detected frameworks',
        details: auditResult.metadata.frameworksDetected.join(', ')
      });
    }

    // Category audits
    auditResult.categories.forEach((category, index) => {
      const categoryStartTime = currentTime + (index * 3000);
      
      timeline.push({
        id: `cat-start-${index}`,
        timestamp: new Date(categoryStartTime),
        type: 'scan',
        category: category.name,
        message: `Auditing ${category.name}`,
        details: `Weight: ${category.weight}%`
      });

      const categoryEndTime = categoryStartTime + 2500;
      timeline.push({
        id: `cat-end-${index}`,
        timestamp: new Date(categoryEndTime),
        type: 'complete',
        category: category.name,
        message: `Completed ${category.name}`,
        details: `Score: ${category.score}/100 (Grade ${category.grade})`,
        duration: 2500
      });

      currentTime = categoryEndTime;
    });

    // Errors
    auditResult.metadata.errors.forEach((error, index) => {
      timeline.push({
        id: `error-${index}`,
        timestamp: new Date(currentTime + 100),
        type: 'error',
        message: 'Error encountered',
        details: error
      });
    });

    // AI Enhancement (if present)
    if (auditResult.aiInsights) {
      currentTime += 2000;
      timeline.push({
        id: 'ai-start',
        timestamp: new Date(currentTime),
        type: 'info',
        message: 'Enhancing results with AI insights',
        details: 'Analyzing patterns and generating recommendations'
      });

      currentTime += 3000;
      timeline.push({
        id: 'ai-complete',
        timestamp: new Date(currentTime),
        type: 'complete',
        message: 'AI enhancement complete',
        details: 'Generated insights and recommendations'
      });
    }

    // Audit complete
    const endTime = startTime.getTime() + auditResult.metadata.duration;
    timeline.push({
      id: 'complete',
      timestamp: new Date(endTime),
      type: 'complete',
      message: 'Audit completed successfully',
      details: `Total duration: ${formatDuration(auditResult.metadata.duration)}`
    });

    setLogs(timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()));
  }, [auditResult]);

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const getTypeColor = (type: string): string => {
    switch (type) {
      case 'start': return 'blue';
      case 'scan': return 'yellow';
      case 'complete': return 'green';
      case 'error': return 'red';
      case 'info': return 'gray';
      default: return 'gray';
    }
  };

  const getTypeIcon = (type: string): string => {
    switch (type) {
      case 'start': return '▶';
      case 'scan': return '🔍';
      case 'complete': return '✓';
      case 'error': return '✗';
      case 'info': return 'ℹ';
      default: return '•';
    }
  };

  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter(log => {
        if (filter === 'errors') return log.type === 'error';
        if (filter === 'categories') return log.category !== undefined;
        return log.type === filter;
      });

  return (
    <div className="timeline-container">
      {/* Page Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Text size="xs" c="dimmed" fw={500} tt="uppercase" mb={4}>Tools</Text>
        <Title order={1} size="h2">Timeline</Title>
      </div>

      <Card className="timeline-header" mb="xl">
        <Group justify="space-between" align="center">
          <div>
            <Text size="lg" fw={600}>Audit Summary</Text>
            <Group gap="lg" mt="xs">
              <div>
                <Text size="xs" c="dimmed">Duration</Text>
                <Text fw={600}>{formatDuration(auditResult.metadata.duration)}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Files Scanned</Text>
                <Text fw={600}>{auditResult.metadata.filesScanned}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Categories</Text>
                <Text fw={600}>{auditResult.categories.length}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Errors</Text>
                <Text fw={600} c={auditResult.metadata.errors.length > 0 ? 'red' : 'green'}>
                  {auditResult.metadata.errors.length}
                </Text>
              </div>
            </Group>
          </div>
          <Group>
            <Select
              value={filter}
              onChange={(value) => setFilter(value || 'all')}
              data={[
                { value: 'all', label: 'All Events' },
                { value: 'categories', label: 'Categories Only' },
                { value: 'errors', label: 'Errors Only' },
                { value: 'complete', label: 'Completions' }
              ]}
              style={{ width: 180 }}
            />
            <Button
              variant={autoScroll ? 'filled' : 'light'}
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
            >
              Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
            </Button>
          </Group>
        </Group>
      </Card>

      <Card className="timeline-card">
        <ScrollArea h={600} type="scroll">
          <MantineTimeline active={-1} bulletSize={24} lineWidth={2}>
            {filteredLogs.map((log) => (
              <MantineTimeline.Item
                key={log.id}
                title={
                  <Group justify="space-between">
                    <Group gap="xs">
                      <Badge color={getTypeColor(log.type)} size="sm">
                        {getTypeIcon(log.type)} {log.type}
                      </Badge>
                      {log.category && (
                        <Badge variant="light" size="sm">
                          {log.category}
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {formatTime(log.timestamp)}
                    </Text>
                  </Group>
                }
                bullet={
                  <div className={`timeline-bullet ${log.type}`}>
                    {getTypeIcon(log.type)}
                  </div>
                }
              >
                <Text size="sm" fw={600}>{log.message}</Text>
                {log.details && (
                  <Text size="xs" c="dimmed" mt={4}>
                    {log.details}
                  </Text>
                )}
                {log.duration && (
                  <Text size="xs" c="dimmed" mt={4}>
                    Duration: {formatDuration(log.duration)}
                  </Text>
                )}
              </MantineTimeline.Item>
            ))}
          </MantineTimeline>
        </ScrollArea>
      </Card>

      <Card className="log-export" mt="xl">
        <Group justify="space-between">
          <Text size="sm">
            Export audit log for debugging or analysis
          </Text>
          <Button
            variant="light"
            size="sm"
            onClick={() => {
              const logText = filteredLogs.map(log => 
                `[${formatTime(log.timestamp)}] ${log.type.toUpperCase()} - ${log.message}${log.details ? ` (${log.details})` : ''}`
              ).join('\n');
              
              const blob = new Blob([logText], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `audit-log-${new Date().toISOString().split('T')[0]}.txt`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export Log
          </Button>
        </Group>
      </Card>
    </div>
  );
};

export default Timeline;