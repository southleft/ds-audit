// Fetch audit results when page loads
console.log('Dashboard loading...');
fetch('/api/results')
  .then(res => {
    console.log('API response status:', res.status);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return res.json();
  })
  .then(data => {
    console.log('Received data:', data);
    renderDashboard(data);
  })
  .catch(err => {
    console.error('Failed to load audit results:', err);
    showError(err.message);
  });

function showError(message) {
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="dashboard">
      <div class="metric-card">
        <h2 style="color: #ef4444;">Error Loading Dashboard</h2>
        <p style="margin-top: 1rem;">Failed to load audit results from the API.</p>
        <pre style="margin-top: 1rem; padding: 1rem; background: rgba(0,0,0,0.2); border-radius: 0.5rem;">${message}</pre>
      </div>
    </div>
  `;
}

function renderDashboard(results) {
  const root = document.getElementById('root');
  
  const dashboard = createElement('div', 'dashboard');
  
  // Header
  const header = createHeader(results);
  dashboard.appendChild(header);
  
  // Overall Score Hero
  const scoreHero = createScoreHero(results);
  dashboard.appendChild(scoreHero);
  
  // Category Metrics Grid
  const metricsGrid = createMetricsGrid(results.categories);
  dashboard.appendChild(metricsGrid);
  
  // Performance Chart
  const chartSection = createChartSection(results);
  dashboard.appendChild(chartSection);
  
  // Recommendations
  if (results.recommendations && results.recommendations.length > 0) {
    const recommendations = createRecommendations(results.recommendations);
    dashboard.appendChild(recommendations);
  }
  
  root.appendChild(dashboard);
  
  // Animate elements on load
  setTimeout(() => {
    animateProgress();
    renderCharts(results);
  }, 100);
}

function createHeader(results) {
  const header = createElement('div', 'header');
  
  const title = createElement('h1');
  title.textContent = 'Design System Health';
  
  const meta = createElement('div', 'header-meta');
  meta.textContent = `Analysis completed ${new Date(results.timestamp).toLocaleString()} • ${results.metadata?.projectPath || 'Current Project'}`;
  
  header.appendChild(title);
  header.appendChild(meta);
  
  return header;
}

function createScoreHero(results) {
  const hero = createElement('div', 'score-hero');
  const content = createElement('div', 'score-content');
  
  // Score Circle
  const scoreCircle = createElement('div', 'score-circle');
  scoreCircle.innerHTML = `
    <svg class="score-ring" width="180" height="180">
      <circle cx="90" cy="90" r="80" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="12"/>
      <circle cx="90" cy="90" r="80" fill="none" stroke="url(#scoreGradient)" stroke-width="12"
              stroke-dasharray="${Math.PI * 160}" stroke-dashoffset="${Math.PI * 160 * (1 - results.overallScore / 100)}"
              stroke-linecap="round"/>
      <defs>
        <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
        </linearGradient>
      </defs>
    </svg>
    <div class="score-value">
      <div class="score-number">${results.overallScore}</div>
      <div class="score-label">Overall Score</div>
    </div>
  `;
  
  // Score Details
  const details = createElement('div', 'score-details');
  details.innerHTML = `
    <h2>${getScoreTitle(results.overallScore)}</h2>
    <p>${getScoreDescription(results.overallScore)}</p>
    <div class="score-badges">
      ${createBadge('✓', `${results.categories.filter(c => c.score >= 80).length} Excellent`, 'success')}
      ${createBadge('!', `${results.categories.filter(c => c.score >= 60 && c.score < 80).length} Good`, 'warning')}
      ${createBadge('×', `${results.categories.filter(c => c.score < 60).length} Needs Work`, 'danger')}
    </div>
  `;
  
  content.appendChild(scoreCircle);
  content.appendChild(details);
  hero.appendChild(content);
  
  return hero;
}

function createMetricsGrid(categories) {
  const grid = createElement('div', 'metrics-grid');
  
  categories.forEach((category, index) => {
    const card = createElement('div', 'metric-card');
    
    const header = createElement('div', 'metric-header');
    
    const info = createElement('div', 'metric-info');
    info.innerHTML = `
      <h3>${category.name}</h3>
      <div class="metric-score">${category.score}<span style="font-size: 1rem; font-weight: 400; color: var(--text-secondary);">/100</span></div>
    `;
    
    const icon = createElement('div', `metric-icon icon-gradient-${(index % 4) + 1}`);
    icon.textContent = getIconForCategory(category.name);
    
    header.appendChild(info);
    header.appendChild(icon);
    
    const progress = createElement('div', 'metric-progress');
    progress.innerHTML = `
      <div class="progress-bar">
        <div class="progress-fill" style="width: 0%; background: ${getColorForScore(category.score)};" data-target="${category.score}"></div>
      </div>
    `;
    
    // Add key metrics
    if (category.metrics) {
      const metricsDiv = createElement('div');
      metricsDiv.style.marginTop = '1rem';
      
      const keyMetrics = Object.entries(category.metrics).slice(0, 2);
      keyMetrics.forEach(([key, value]) => {
        const metric = createElement('div');
        metric.style.display = 'flex';
        metric.style.justifyContent = 'space-between';
        metric.style.fontSize = '0.875rem';
        metric.style.marginTop = '0.5rem';
        metric.innerHTML = `
          <span style="color: var(--text-secondary);">${formatMetricName(key)}</span>
          <span style="font-weight: 600;">${formatMetricValue(value)}</span>
        `;
        metricsDiv.appendChild(metric);
      });
      card.appendChild(metricsDiv);
    }
    
    card.appendChild(header);
    card.appendChild(progress);
    
    grid.appendChild(card);
  });
  
  return grid;
}

function createChartSection(results) {
  const section = createElement('div', 'chart-section');
  
  const header = createElement('div', 'chart-header');
  header.innerHTML = `
    <h2>Category Performance</h2>
    <div class="chart-legend" style="display: flex; gap: 1rem; font-size: 0.875rem;">
      <span style="color: var(--text-secondary);">Hover for details</span>
    </div>
  `;
  
  const container = createElement('div', 'chart-container');
  container.innerHTML = '<canvas id="performanceChart"></canvas>';
  
  section.appendChild(header);
  section.appendChild(container);
  
  return section;
}

function createRecommendations(recommendations) {
  const section = createElement('div', 'recommendations');
  
  const title = createElement('h2');
  title.textContent = 'Key Recommendations';
  section.appendChild(title);
  
  recommendations.slice(0, 5).forEach(rec => {
    const item = createElement('div', 'recommendation-item');
    
    const icon = createElement('div', 'recommendation-icon');
    icon.style.background = getPriorityGradient(rec.priority);
    icon.textContent = getPriorityIcon(rec.priority);
    
    const content = createElement('div', 'recommendation-content');
    content.innerHTML = `
      <div class="recommendation-title">${rec.title}</div>
      <div class="recommendation-description">${rec.description}</div>
      <div class="recommendation-tags">
        <span class="tag tag-${rec.priority}">Priority: ${rec.priority}</span>
        <span class="tag">Effort: ${rec.effort}</span>
        <span class="tag">Impact: ${rec.impact}</span>
      </div>
    `;
    
    item.appendChild(icon);
    item.appendChild(content);
    section.appendChild(item);
  });
  
  return section;
}

// Helper functions
function createElement(tag, className) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  return element;
}

function createBadge(icon, text, type) {
  return `<span class="badge badge-${type}">${icon} ${text}</span>`;
}

function getIconForCategory(name) {
  const icons = {
    'Component Library': '◉',
    'Design Tokens': '◈',
    'Documentation': '📄',
    'Governance': '⚖',
    'Tooling & Infrastructure': '⚙',
    'Performance': '⚡',
    'Accessibility': '♿'
  };
  return icons[name] || '•';
}

function getColorForScore(score) {
  if (score >= 80) return 'linear-gradient(90deg, #10b981, #059669)';
  if (score >= 60) return 'linear-gradient(90deg, #f59e0b, #d97706)';
  return 'linear-gradient(90deg, #ef4444, #dc2626)';
}

function getScoreTitle(score) {
  if (score >= 90) return 'Excellent Health';
  if (score >= 80) return 'Strong Foundation';
  if (score >= 70) return 'Good Progress';
  if (score >= 60) return 'Room for Growth';
  return 'Needs Attention';
}

function getScoreDescription(score) {
  if (score >= 90) return 'Your design system is in excellent shape with mature practices across all categories.';
  if (score >= 80) return 'Your design system has a strong foundation with only minor areas for improvement.';
  if (score >= 70) return 'Your design system is progressing well but has some key areas that need attention.';
  if (score >= 60) return 'Your design system has potential but requires focused effort in several areas.';
  return 'Your design system needs significant investment to reach its full potential.';
}

function getPriorityGradient(priority) {
  const gradients = {
    high: 'linear-gradient(135deg, #ef4444, #dc2626)',
    medium: 'linear-gradient(135deg, #f59e0b, #d97706)',
    low: 'linear-gradient(135deg, #10b981, #059669)'
  };
  return gradients[priority] || gradients.medium;
}

function getPriorityIcon(priority) {
  const icons = {
    high: '⚠',
    medium: '!',
    low: 'ℹ'
  };
  return icons[priority] || '•';
}

function formatMetricName(name) {
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

function formatMetricValue(value) {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return Object.keys(value).length;
  if (typeof value === 'number') return value.toLocaleString();
  return value;
}

function animateProgress() {
  const progressBars = document.querySelectorAll('.progress-fill');
  progressBars.forEach(bar => {
    const target = parseFloat(bar.dataset.target);
    setTimeout(() => {
      bar.style.width = `${target}%`;
    }, 100);
  });
}

function renderCharts(results) {
  const ctx = document.getElementById('performanceChart').getContext('2d');
  
  // Create a more visually appealing chart
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: results.categories.map(cat => cat.name),
      datasets: [{
        label: 'Score',
        data: results.categories.map(cat => cat.score),
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        borderWidth: 3,
        pointBackgroundColor: '#667eea',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          cornerRadius: 8,
          titleFont: {
            size: 14,
            weight: 600
          },
          bodyFont: {
            size: 14
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            color: 'rgba(255, 255, 255, 0.5)',
            font: {
              size: 12
            }
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          }
        },
        x: {
          ticks: {
            color: 'rgba(255, 255, 255, 0.5)',
            font: {
              size: 12
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