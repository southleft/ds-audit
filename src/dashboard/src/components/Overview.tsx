import React, { useEffect, useRef } from 'react';
import { Grid, Card, Text, Title, Group, Badge, Progress, Button, Stack } from '@mantine/core';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Chart, registerables } from 'chart.js';
import { AuditResult } from '@types';
import './Overview.css';

Chart.register(...registerables);

interface OverviewProps {
  auditResult: AuditResult;
}

const getColorForScore = (score: number): string => {
  if (score >= 90) return '#0cce6b'; // Green
  if (score >= 50) return '#ffa400'; // Orange
  return '#ff4e42'; // Red
};

// Lighthouse-style circular score indicator component
const CircularScoreIndicator: React.FC<{ 
  score: number; 
  label: string; 
  description?: string;
}> = ({ score, label, description }) => {
  const color = getColorForScore(score);
  const circumference = 2 * Math.PI * 36; // radius = 36
  const strokeDasharray = `${(score / 100) * circumference} ${circumference}`;

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center',
      padding: '1.5rem',
      flex: 1
    }}>
      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <svg width="96" height="96" viewBox="0 0 96 96">
          {/* Background circle */}
          <circle
            cx="48"
            cy="48"
            r="36"
            fill="none"
            stroke="#44444d"
            strokeWidth="3"
          />
          {/* Score circle */}
          <circle
            cx="48"
            cy="48"
            r="36"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
            transform="rotate(-90 48 48)"
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '1.75rem',
          fontWeight: 700,
          color: color
        }}>
          {score}
        </div>
      </div>
      <Text size="sm" fw={600} c="var(--text-primary)" style={{ marginBottom: '0.25rem' }}>
        {label}
      </Text>
      {description && (
        <Text size="xs" c="dimmed" style={{ textAlign: 'center', maxWidth: '180px' }}>
          {description}
        </Text>
      )}
    </div>
  );
};

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
    // Don't create charts if no categories
    if (!auditResult.categories || auditResult.categories.length === 0) {
      return;
    }
    
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
              backgroundColor: 'rgba(24, 24, 27, 0.95)',
              titleColor: '#f4f4f5',
              bodyColor: '#a8a8b3',
              borderColor: '#3a3a3e',
              borderWidth: 1,
              cornerRadius: 6,
              padding: 12,
              displayColors: false,
              callbacks: {
                title: function() {
                  return 'Category Score';
                },
                label: function(context: any) {
                  const category = context.label;
                  const score = context.parsed.r;
                  const categoryData = auditResult.categories.find(c => c.name === category);
                  return [
                    `${category}: ${score}/100`,
                    `Grade: ${categoryData?.grade || 'N/A'}`,
                    `${categoryData?.findings?.length || 0} findings`
                  ];
                }
              }
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

  // Calculate rolled-up scores for the 4 main indicators
  const calculateComponentHealth = () => {
    const componentCat = auditResult.categories.find(c => c.name === 'Components');
    const accessibilityCat = auditResult.categories.find(c => c.name === 'Accessibility');
    if (!componentCat && !accessibilityCat) return 0;
    
    // Weighted average: 70% components, 30% accessibility
    const compScore = componentCat?.score || 0;
    const a11yScore = accessibilityCat?.score || 0;
    return Math.round(compScore * 0.7 + a11yScore * 0.3);
  };

  const calculateTokenArchitecture = () => {
    const tokenCat = auditResult.categories.find(c => c.name === 'Tokens');
    return tokenCat?.score || 0;
  };

  const calculateDocumentationGovernance = () => {
    const docCat = auditResult.categories.find(c => c.name === 'Documentation');
    const govCat = auditResult.categories.find(c => c.name === 'Governance');
    if (!docCat && !govCat) return 0;
    
    // Average of both categories
    const docScore = docCat?.score || 0;
    const govScore = govCat?.score || 0;
    const count = (docCat ? 1 : 0) + (govCat ? 1 : 0);
    return count > 0 ? Math.round((docScore + govScore) / count) : 0;
  };

  const componentHealthScore = calculateComponentHealth();
  const tokenArchitectureScore = calculateTokenArchitecture();
  const docGovernanceScore = calculateDocumentationGovernance();

  // Calculate key insights - handle empty categories array
  const topCategory = auditResult.categories.length > 0 
    ? auditResult.categories.reduce((prev, current) => (prev.score > current.score) ? prev : current)
    : null;
  const bottomCategory = auditResult.categories.length > 0
    ? auditResult.categories.reduce((prev, current) => (prev.score < current.score) ? prev : current)
    : null;
  
  // Get bottom 3 categories for improvement
  const bottomThreeCategories = auditResult.categories.length > 0
    ? [...auditResult.categories]
        .sort((a, b) => a.score - b.score)
        .slice(0, 3)
    : [];
  
  // Calculate critical issues per category
  const getCriticalIssueCount = (category: any) => {
    return category.findings?.filter((f: any) => f.type === 'error').length || 0;
  };
  
  // Show message if no categories yet
  if (!auditResult.categories || auditResult.categories.length === 0) {
    return (
      <div className="overview-container">
        <Card style={{ 
          textAlign: 'center', 
          padding: '4rem 2rem',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-color)'
        }}>
          <Title order={3} mb="md">Audit In Progress</Title>
          <Text c="dimmed" mb="xl">
            The audit is currently analyzing your design system. 
            Please check the Progress tab to see real-time updates.
          </Text>
          <Button 
            variant="filled" 
            onClick={() => window.location.hash = 'progress'}
          >
            View Progress
          </Button>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="overview-container">
      {/* Page Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Text size="xs" c="dimmed" fw={500} tt="uppercase" mb={4}>Analysis</Text>
        <Title order={1} size="h2">Overview</Title>
      </div>
      
      {/* Lighthouse-style 4 circular indicators */}
      <Card style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '2rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <CircularScoreIndicator 
            score={auditResult.overallScore}
            label="Design System Health"
            description="Overall weighted score"
          />
          <CircularScoreIndicator 
            score={componentHealthScore}
            label="Component Health"
            description="Component coverage & a11y"
          />
          <CircularScoreIndicator 
            score={tokenArchitectureScore}
            label="Token Architecture"
            description="Design token structure"
          />
          <CircularScoreIndicator 
            score={docGovernanceScore}
            label="Documentation & Governance"
            description="Docs coverage & versioning"
          />
        </div>
      </Card>

      {/* Charts Section */}
      <div className="charts-section">
        <Grid gutter="lg">
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <Card className="chart-card">
              <div className="chart-header">
                <div>
                  <Title order={4}>Category Rankings</Title>
                  <Text size="xs" c="dimmed">Performance ranked by score</Text>
                </div>
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
                <div>
                  <Title order={4}>System Coverage Overview</Title>
                  <Text size="xs" c="dimmed">Holistic view of all categories</Text>
                </div>
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
                  <Group gap="xs">
                    <Text size="xs" c="dimmed">{category.findings?.length || 0} findings</Text>
                    {getCriticalIssueCount(category) > 0 && (
                      <Badge size="xs" color="red" variant="light">
                        {getCriticalIssueCount(category)} critical
                      </Badge>
                    )}
                  </Group>
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
      {(topCategory && bottomCategory) && (
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
      )}
    </div>
  );
};

export default Overview;