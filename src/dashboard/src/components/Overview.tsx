import React, { useEffect, useRef } from 'react';
import { Grid, Card, Text, Title, Group, Badge, Progress } from '@mantine/core';
import { Chart, registerables } from 'chart.js';
import { AuditResult } from '@types';
import './Overview.css';

Chart.register(...registerables);

interface OverviewProps {
  auditResult: AuditResult;
}

const Overview: React.FC<OverviewProps> = ({ auditResult }) => {
  const radarChartRef = useRef<HTMLCanvasElement>(null);
  const barChartRef = useRef<HTMLCanvasElement>(null);
  const chartInstances = useRef<{ radar?: Chart; bar?: Chart }>({});

  useEffect(() => {
    if (radarChartRef.current && barChartRef.current) {
      createCharts();
    }

    return () => {
      if (chartInstances.current.radar) chartInstances.current.radar.destroy();
      if (chartInstances.current.bar) chartInstances.current.bar.destroy();
    };
  }, [auditResult]);

  const createCharts = () => {
    const categories = auditResult.categories.map(cat => cat.name);
    const scores = auditResult.categories.map(cat => cat.score);
    const colors = auditResult.categories.map(cat => getColorForScore(cat.score));

    // Radar Chart
    if (radarChartRef.current) {
      chartInstances.current.radar = new Chart(radarChartRef.current, {
        type: 'radar',
        data: {
          labels: categories,
          datasets: [{
            label: 'Score',
            data: scores,
            backgroundColor: 'rgba(99, 102, 241, 0.2)',
            borderColor: '#6366f1',
            borderWidth: 2,
            pointBackgroundColor: '#6366f1',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: '#6366f1'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            r: {
              beginAtZero: true,
              max: 100,
              ticks: {
                color: '#6b7280',
                backdropColor: 'transparent'
              },
              grid: {
                color: '#374151'
              },
              pointLabels: {
                color: '#d1d5db',
                font: {
                  size: 12
                }
              }
            }
          }
        }
      });
    }

    // Bar Chart
    if (barChartRef.current) {
      chartInstances.current.bar = new Chart(barChartRef.current, {
        type: 'bar',
        data: {
          labels: categories,
          datasets: [{
            label: 'Score',
            data: scores,
            backgroundColor: colors,
            borderWidth: 0,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: {
                color: '#6b7280'
              },
              grid: {
                color: '#374151'
              }
            },
            x: {
              ticks: {
                color: '#d1d5db'
              },
              grid: {
                display: false
              }
            }
          }
        }
      });
    }
  };

  const getColorForScore = (score: number): string => {
    if (score >= 90) return '#10b981';
    if (score >= 80) return '#3b82f6';
    if (score >= 70) return '#f59e0b';
    if (score >= 60) return '#f97316';
    return '#ef4444';
  };

  const getGradeColor = (grade: string): string => {
    const gradeColors: Record<string, string> = {
      'A': 'green',
      'B': 'blue',
      'C': 'yellow',
      'D': 'orange',
      'F': 'red'
    };
    return gradeColors[grade] || 'gray';
  };

  return (
    <div className="overview-container">
      <Title order={2} mb="xl">Design System Health Overview</Title>
      
      <Grid mb="xl">
        <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
          <Card className="metric-card">
            <Text size="sm" c="dimmed" fw={500}>Overall Score</Text>
            <Group align="baseline" gap="xs" mt="xs">
              <Text size="xl" fw={700} c={getColorForScore(auditResult.overallScore)}>
                {auditResult.overallScore}
              </Text>
              <Badge size="lg" color={getGradeColor(auditResult.overallGrade)}>
                Grade {auditResult.overallGrade}
              </Badge>
            </Group>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
          <Card className="metric-card">
            <Text size="sm" c="dimmed" fw={500}>Categories Audited</Text>
            <Text size="xl" fw={700} mt="xs">
              {auditResult.categories.length}
            </Text>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
          <Card className="metric-card">
            <Text size="sm" c="dimmed" fw={500}>Files Analyzed</Text>
            <Text size="xl" fw={700} mt="xs">
              {auditResult.metadata?.filesScanned || 0}
            </Text>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
          <Card className="metric-card">
            <Text size="sm" c="dimmed" fw={500}>Critical Issues</Text>
            <Text size="xl" fw={700} c="red" mt="xs">
              {auditResult.recommendations?.filter(r => r.priority === 'high').length || 0}
            </Text>
          </Card>
        </Grid.Col>
      </Grid>

      <Grid>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card className="chart-card">
            <Title order={4} mb="md">Category Performance</Title>
            <div className="chart-container">
              <canvas ref={radarChartRef}></canvas>
            </div>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card className="chart-card">
            <Title order={4} mb="md">Score Distribution</Title>
            <div className="chart-container">
              <canvas ref={barChartRef}></canvas>
            </div>
          </Card>
        </Grid.Col>
      </Grid>

      <Card mt="xl">
        <Title order={4} mb="md">Category Summary</Title>
        <div className="category-summary">
          {auditResult.categories.map((category) => (
            <div key={category.name} className="category-item">
              <Group justify="space-between" mb="xs">
                <Text fw={500}>{category.name}</Text>
                <Badge color={getGradeColor(category.grade)}>
                  {category.score} - Grade {category.grade}
                </Badge>
              </Group>
              <Progress
                value={category.score}
                color={getColorForScore(category.score)}
                size="sm"
                radius="sm"
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default Overview;