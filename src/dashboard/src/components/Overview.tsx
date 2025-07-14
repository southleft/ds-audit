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

    // Horizontal Bar Chart with sorted data
    if (barChartRef.current) {
      // Sort categories by score for better ranking visualization
      const sortedData = auditResult.categories
        .map(cat => ({ name: cat.name, score: cat.score, color: getColorForScore(cat.score) }))
        .sort((a, b) => b.score - a.score);
      
      const sortedLabels = sortedData.map(item => item.name);
      const sortedScores = sortedData.map(item => item.score);
      const sortedColors = sortedData.map(item => item.color);

      chartInstances.current.bar = new Chart(barChartRef.current, {
        type: 'bar',
        data: {
          labels: sortedLabels,
          datasets: [{
            label: 'Score',
            data: sortedScores,
            backgroundColor: sortedColors.map(color => color + '88'),
            borderColor: sortedColors,
            borderWidth: 1,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y', // Makes it horizontal
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
              padding: 8,
              callbacks: {
                title: function(context) {
                  return context[0].label;
                },
                label: function(context) {
                  return `Score: ${context.parsed.x}/100`;
                }
              }
            }
          },
          scales: {
            x: {
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
            y: {
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
      
      {/* Overall Score - Highlighted First */}
      <Card className="overall-score-card" mb="xl" style={{ 
        background: 'linear-gradient(135deg, rgba(91, 99, 211, 0.1) 0%, rgba(45, 55, 145, 0.1) 100%)',
        border: '1px solid rgba(91, 99, 211, 0.2)',
        borderRadius: '12px'
      }}>
        <Group justify="center" align="center" style={{ textAlign: 'center' }}>
          <div>
            <Text size="xs" c="dimmed" fw={500} tt="uppercase" mb={4}>Design System Health</Text>
            <Text size="4rem" fw={700} style={{ lineHeight: 1, color: 'var(--mantine-color-blue-6)' }}>
              {auditResult.overallScore}
            </Text>
            <Text size="lg" c="dimmed" mb="sm">out of 100</Text>
            <Badge size="xl" color={getGradeColor(auditResult.overallGrade)} variant="filled">
              Grade {auditResult.overallGrade}
            </Badge>
          </div>
        </Group>
      </Card>

      {/* Secondary Metrics Row */}
      <div className="secondary-metrics-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
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
      </div>

      {/* Enhanced Charts Section - Different Data Perspectives */}
      <div className="charts-section">
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <Card className="chart-card">
              <div className="chart-header">
                <Title order={4}>Category Rankings</Title>
                <Text size="xs" c="dimmed">Performance ranked by score</Text>
                <Button 
                  variant="subtle" 
                  size="xs"
                  onClick={() => window.location.hash = 'categories'}
                >
                  Details →
                </Button>
              </div>
              <div className="chart-container">
                <canvas ref={barChartRef}></canvas>
              </div>
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 6 }}>
            <Card className="chart-card">
              <div className="chart-header">
                <Title order={4}>System Health Overview</Title>
                <Text size="xs" c="dimmed">Holistic view of all categories</Text>
                <Button 
                  variant="subtle" 
                  size="xs"
                  onClick={() => window.location.hash = 'categories'}
                >
                  Analyze →
                </Button>
              </div>
              <div className="chart-container">
                <canvas ref={radarChartRef}></canvas>
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