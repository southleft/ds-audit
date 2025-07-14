import React, { useEffect, useRef } from 'react';
import { Grid, Card, Text, Title, Group, Badge, Progress, Button } from '@mantine/core';
import { AlertTriangle, Zap, FileText } from 'lucide-react';
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

    // Radar Chart with modern styling
    if (radarChartRef.current) {
      chartInstances.current.radar = new Chart(radarChartRef.current, {
        type: 'radar',
        data: {
          labels: categories,
          datasets: [{
            label: 'Score',
            data: scores,
            backgroundColor: 'rgba(91, 99, 211, 0.15)',
            borderColor: '#5b63d3',
            borderWidth: 2,
            pointBackgroundColor: '#5b63d3',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: '#5b63d3',
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: 10
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'rgba(24, 24, 27, 0.9)',
              titleColor: '#f4f4f5',
              bodyColor: '#a8a8b3',
              borderColor: '#2a2a2e',
              borderWidth: 1,
              cornerRadius: 4,
              padding: 8
            }
          },
          scales: {
            r: {
              beginAtZero: true,
              max: 100,
              ticks: {
                color: '#71717a',
                backdropColor: 'transparent',
                stepSize: 20
              },
              grid: {
                color: '#2a2a2e'
              },
              pointLabels: {
                color: '#a8a8b3',
                font: {
                  size: 11,
                  family: 'Work Sans'
                }
              }
            }
          }
        }
      });
    }

    // Bar Chart with modern styling
    if (barChartRef.current) {
      chartInstances.current.bar = new Chart(barChartRef.current, {
        type: 'bar',
        data: {
          labels: categories,
          datasets: [{
            label: 'Score',
            data: scores,
            backgroundColor: colors.map(color => color + '88'),
            borderColor: colors,
            borderWidth: 1,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: 10
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'rgba(24, 24, 27, 0.9)',
              titleColor: '#f4f4f5',
              bodyColor: '#a8a8b3',
              borderColor: '#2a2a2e',
              borderWidth: 1,
              cornerRadius: 4,
              padding: 8
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: {
                color: '#71717a',
                stepSize: 25
              },
              grid: {
                color: '#2a2a2e'
              }
            },
            x: {
              ticks: {
                color: '#a8a8b3',
                font: {
                  size: 11
                }
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
    if (score >= 90) return '#22c55e';
    if (score >= 80) return '#3b82f6';
    if (score >= 70) return '#f97316';
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

  // Calculate key insights
  const highPriorityIssues = auditResult.recommendations?.filter(r => r.priority === 'high').length || 0;
  const quickWins = auditResult.recommendations?.filter(r => r.effort === 'quick-win').length || 0;
  const topCategory = auditResult.categories.reduce((prev, current) => (prev.score > current.score) ? prev : current);
  const bottomCategory = auditResult.categories.reduce((prev, current) => (prev.score < current.score) ? prev : current);
  const averageScore = Math.round(auditResult.categories.reduce((sum, cat) => sum + cat.score, 0) / auditResult.categories.length);
  
  return (
    <div className="overview-container">
      {/* Page Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Text size="xs" c="dimmed" fw={500} tt="uppercase" mb={4}>Analysis</Text>
        <Title order={1} size="h2">Overview</Title>
      </div>
      
      {/* Primary Metrics Row - First thing users see */}
      <div className="primary-metrics-row">
        <div className="metric-card priority">
          <div className="metric-icon"><AlertTriangle size={24} color="var(--mantine-color-red-6)" /></div>
          <div className="metric-content">
            <Text className="metric-value">{highPriorityIssues}</Text>
            <Text className="metric-label">High Priority</Text>
          </div>
        </div>
        
        <div className="metric-card quick-wins">
          <div className="metric-icon"><Zap size={24} color="var(--mantine-color-yellow-6)" /></div>
          <div className="metric-content">
            <Text className="metric-value">{quickWins}</Text>
            <Text className="metric-label">Quick Wins</Text>
          </div>
        </div>
        
        <div className="metric-card files">
          <div className="metric-icon"><FileText size={24} color="var(--mantine-color-blue-6)" /></div>
          <div className="metric-content">
            <Text className="metric-value">{auditResult.metadata?.filesScanned || 0}</Text>
            <Text className="metric-label">Files Analyzed</Text>
          </div>
        </div>
        
        <div className="metric-card score">
          <div className="metric-content">
            <Text className="metric-value">{auditResult.overallScore}</Text>
            <Text className="metric-label">Overall Score</Text>
          </div>
          <Badge size="sm" color={getGradeColor(auditResult.overallGrade)} variant="light">
            {auditResult.overallGrade}
          </Badge>
        </div>
      </div>

      {/* Charts Section - Directly beneath metrics */}
      <div className="charts-section">
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, lg: 8 }}>
            <Card className="chart-card">
              <div className="chart-header">
                <Title order={4}>Category Performance</Title>
                <Button 
                  variant="subtle" 
                  size="xs"
                  onClick={() => window.location.hash = 'categories'}
                >
                  Details →
                </Button>
              </div>
              <div className="chart-container">
                <canvas ref={radarChartRef}></canvas>
              </div>
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Card className="chart-card">
              <div className="chart-header">
                <Title order={4}>Score Distribution</Title>
                <Button 
                  variant="subtle" 
                  size="xs"
                  onClick={() => window.location.hash = 'categories'}
                >
                  View →
                </Button>
              </div>
              <div className="chart-container small">
                <canvas ref={barChartRef}></canvas>
              </div>
            </Card>
          </Grid.Col>
        </Grid>
      </div>
      
      {/* Category Summary with performance indicators */}
      <Card className="category-summary-card">
        <div className="summary-header">
          <Title order={4}>Category Details</Title>
          <Text size="sm" c="dimmed">Click any category for detailed analysis</Text>
        </div>
        <div className="category-grid">
          {auditResult.categories
            .sort((a, b) => b.score - a.score)
            .map((category) => (
            <Card 
              key={category.name} 
              className="category-item clickable"
              onClick={() => {
                const event = new CustomEvent('navigateToCategory', { 
                  detail: { categoryName: category.name } 
                });
                window.dispatchEvent(event);
                window.location.hash = 'categories';
              }}
            >
              <div className="category-header">
                <div className="category-info">
                  <Text fw={600}>{category.name}</Text>
                  <Text size="xs" c="dimmed">{category.findings?.length || 0} findings</Text>
                </div>
                <Badge 
                  size="lg" 
                  color={getGradeColor(category.grade)}
                  variant="light"
                >
                  {category.score}
                </Badge>
              </div>
              
              <Progress
                value={category.score}
                color={getColorForScore(category.score)}
                size="sm"
                radius="sm"
                className="category-progress"
              />
            </Card>
          ))}
        </div>
      </Card>

      {/* Additional insights section */}
      <div className="insights-section">
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card className="insight-card">
              <Group justify="space-between" mb="sm">
                <Title order={4}>Top Performer</Title>
                <Badge color="green" variant="light">{topCategory.score}/100</Badge>
              </Group>
              <Text fw={600} size="lg">{topCategory.name}</Text>
              <Text size="sm" c="dimmed">Excellent implementation</Text>
            </Card>
          </Grid.Col>
          
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card className="insight-card">
              <Group justify="space-between" mb="sm">
                <Title order={4}>Needs Attention</Title>
                <Badge color="orange" variant="light">{bottomCategory.score}/100</Badge>
              </Group>
              <Text fw={600} size="lg">{bottomCategory.name}</Text>
              <Text size="sm" c="dimmed">Priority for improvement</Text>
            </Card>
          </Grid.Col>
        </Grid>
      </div>
    </div>
  );
};

export default Overview;