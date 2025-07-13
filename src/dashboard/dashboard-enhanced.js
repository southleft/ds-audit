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

// Category descriptions and what they measure
const categoryDescriptions = {
  'Component Library': {
    description: 'Evaluates the structure, organization, and quality of your component library.',
    measures: ['Component architecture', 'Test coverage', 'TypeScript definitions', 'Storybook documentation', 'Accessibility compliance']
  },
  'Design Tokens': {
    description: 'Assesses your design token system for consistency and scalability.',
    measures: ['Token architecture', 'Naming conventions', 'Token usage', 'Cross-platform support', 'Documentation']
  },
  'Documentation': {
    description: 'Reviews the completeness and quality of your design system documentation.',
    measures: ['Component docs', 'Usage guidelines', 'Code examples', 'Design principles', 'Getting started guides']
  },
  'Governance': {
    description: 'Examines the processes and practices for maintaining your design system.',
    measures: ['Contribution guidelines', 'Version control', 'Release process', 'Team structure', 'Decision making']
  },
  'Tooling & Infrastructure': {
    description: 'Evaluates the development tools and infrastructure supporting your design system.',
    measures: ['Build tools', 'Linting', 'Testing framework', 'CI/CD pipeline', 'Package management']
  },
  'Performance': {
    description: 'Analyzes the performance impact and optimization of your design system.',
    measures: ['Bundle size', 'Tree shaking', 'Load time', 'Runtime performance', 'Optimization strategies']
  },
  'Accessibility': {
    description: 'Validates accessibility standards and inclusive design practices.',
    measures: ['ARIA compliance', 'Keyboard navigation', 'Screen reader support', 'Color contrast', 'Focus management']
  }
};

function renderDashboard(results) {
  const root = document.getElementById('root');
  
  const dashboard = createElement('div', 'dashboard');
  
  // Header with branding
  const header = createHeader(results);
  dashboard.appendChild(header);
  
  // Scan info
  const scanInfo = createScanInfo(results);
  dashboard.appendChild(scanInfo);
  
  // Overall Score Hero
  const scoreHero = createScoreHero(results);
  dashboard.appendChild(scoreHero);
  
  // Category Metrics Grid with expandable details
  const metricsGrid = createDetailedMetricsGrid(results.categories);
  dashboard.appendChild(metricsGrid);
  
  // Performance Chart
  const chartSection = createChartSection(results);
  dashboard.appendChild(chartSection);
  
  // Role-based Recommendations
  if (results.recommendations && results.recommendations.length > 0) {
    const recommendations = createRoleBasedRecommendations(results.recommendations);
    dashboard.appendChild(recommendations);
  }
  
  root.appendChild(dashboard);
  
  // Animate elements on load
  setTimeout(() => {
    animateProgress();
    renderCharts(results);
    setupInteractions();
  }, 100);
}

function createHeader(results) {
  const header = createElement('div', 'header');
  
  header.innerHTML = `
    <div class="brand">
      <div class="brand-icon">DS</div>
      <h1>dsaudit</h1>
    </div>
    <h2>Design System Health Report</h2>
    <p class="header-description">
      Comprehensive analysis of your design system's architecture, implementation, and adoption.
      This report identifies strengths, weaknesses, and provides actionable recommendations to improve your design system.
    </p>
    <div class="header-meta">
      Analysis completed ${new Date(results.timestamp).toLocaleString()} • ${results.metadata?.projectPath || 'Current Project'}
    </div>
  `;
  
  return header;
}

function createScanInfo(results) {
  const scanInfo = createElement('div', 'scan-info');
  
  // Calculate total files scanned
  const totalFiles = results.categories.reduce((sum, cat) => sum + (cat.metrics?.filesScanned || 0), 0);
  const totalIssues = results.categories.reduce((sum, cat) => sum + (cat.findings?.length || 0), 0);
  
  scanInfo.innerHTML = `
    <div class="scan-stat">
      <div class="scan-stat-value">${totalFiles.toLocaleString()}</div>
      <div class="scan-stat-label">Files Analyzed</div>
    </div>
    <div class="scan-stat">
      <div class="scan-stat-value">${results.categories.length}</div>
      <div class="scan-stat-label">Categories Evaluated</div>
    </div>
    <div class="scan-stat">
      <div class="scan-stat-value">${totalIssues}</div>
      <div class="scan-stat-label">Total Findings</div>
    </div>
    <div class="scan-stat">
      <div class="scan-stat-value">${results.recommendations?.length || 0}</div>
      <div class="scan-stat-label">Recommendations</div>
    </div>
  `;
  
  return scanInfo;
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
  
  // Count categories by performance
  const excellent = results.categories.filter(c => c.score >= 80).length;
  const good = results.categories.filter(c => c.score >= 60 && c.score < 80).length;
  const needsWork = results.categories.filter(c => c.score < 60).length;
  
  details.innerHTML = `
    <h2>${getScoreTitle(results.overallScore)}</h2>
    <p>${getScoreDescription(results.overallScore)}</p>
    <div class="score-badges">
      ${excellent > 0 ? createBadge('✓', `${excellent} Excellent`, 'success') : ''}
      ${good > 0 ? createBadge('!', `${good} Good`, 'warning') : ''}
      ${needsWork > 0 ? createBadge('×', `${needsWork} Needs Work`, 'danger') : ''}
    </div>
  `;
  
  content.appendChild(scoreCircle);
  content.appendChild(details);
  hero.appendChild(content);
  
  return hero;
}

function createDetailedMetricsGrid(categories) {
  const grid = createElement('div', 'metrics-grid');
  
  categories.forEach((category, index) => {
    const card = createElement('div', 'metric-card');
    card.dataset.category = category.name;
    
    // Summary section (always visible)
    const summary = createElement('div', 'metric-summary');
    
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
    summary.appendChild(header);
    
    // Key metrics preview
    if (category.metrics) {
      const metricsPreview = createElement('div');
      metricsPreview.style.marginTop = '1rem';
      
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
        metricsPreview.appendChild(metric);
      });
      summary.appendChild(metricsPreview);
    }
    
    const progress = createElement('div', 'metric-progress');
    progress.innerHTML = `
      <div class="progress-bar">
        <div class="progress-fill" style="width: 0%; background: ${getColorForScore(category.score)};" data-target="${category.score}"></div>
      </div>
    `;
    summary.appendChild(progress);
    
    const hint = createElement('div', 'expand-hint');
    hint.textContent = 'Click for details';
    summary.appendChild(hint);
    
    card.appendChild(summary);
    
    // Detailed section (hidden by default)
    const details = createMetricDetails(category);
    card.appendChild(details);
    
    grid.appendChild(card);
  });
  
  return grid;
}

function createMetricDetails(category) {
  const details = createElement('div', 'metric-details');
  
  // Description
  const desc = categoryDescriptions[category.name];
  if (desc) {
    const description = createElement('div', 'metric-description');
    description.innerHTML = `
      <p>${desc.description}</p>
      <p style="margin-top: 0.5rem; font-size: 0.875rem;">
        <strong>What we measure:</strong> ${desc.measures.join(', ')}
      </p>
    `;
    details.appendChild(description);
  }
  
  // Issue breakdown
  if (category.findings && category.findings.length > 0) {
    const breakdown = createElement('div', 'issue-breakdown');
    
    // Group findings by severity
    const critical = category.findings.filter(f => f.severity === 'critical' || f.severity === 'high');
    const warnings = category.findings.filter(f => f.severity === 'medium');
    const passed = category.findings.filter(f => f.type === 'success' || f.severity === 'low');
    
    // Critical issues
    if (critical.length > 0) {
      const section = createElement('div', 'issue-section');
      section.innerHTML = `
        <h4><span style="color: var(--danger);">●</span> Critical Issues (${critical.length})</h4>
        <ul class="issue-list">
          ${critical.slice(0, 3).map(f => `
            <li class="issue-item issue-critical">
              ${f.message}
              ${f.file ? `<div class="issue-file">${f.file}</div>` : ''}
            </li>
          `).join('')}
          ${critical.length > 3 ? `<li class="issue-item" style="text-align: center; opacity: 0.6;">...and ${critical.length - 3} more</li>` : ''}
        </ul>
      `;
      breakdown.appendChild(section);
    }
    
    // Warnings
    if (warnings.length > 0) {
      const section = createElement('div', 'issue-section');
      section.innerHTML = `
        <h4><span style="color: var(--warning);">●</span> Warnings (${warnings.length})</h4>
        <ul class="issue-list">
          ${warnings.slice(0, 3).map(f => `
            <li class="issue-item issue-warning">
              ${f.message}
              ${f.file ? `<div class="issue-file">${f.file}</div>` : ''}
            </li>
          `).join('')}
          ${warnings.length > 3 ? `<li class="issue-item" style="text-align: center; opacity: 0.6;">...and ${warnings.length - 3} more</li>` : ''}
        </ul>
      `;
      breakdown.appendChild(section);
    }
    
    // Passed checks
    if (passed.length > 0) {
      const section = createElement('div', 'issue-section');
      section.innerHTML = `
        <h4><span style="color: var(--success);">●</span> Passed Checks (${passed.length})</h4>
        <ul class="issue-list">
          ${passed.slice(0, 3).map(f => `
            <li class="issue-item issue-passed">
              ${f.message}
              ${f.file ? `<div class="issue-file">${f.file}</div>` : ''}
            </li>
          `).join('')}
          ${passed.length > 3 ? `<li class="issue-item" style="text-align: center; opacity: 0.6;">...and ${passed.length - 3} more</li>` : ''}
        </ul>
      `;
      breakdown.appendChild(section);
    }
    
    details.appendChild(breakdown);
  }
  
  // All metrics
  if (category.metrics && Object.keys(category.metrics).length > 2) {
    const allMetrics = createElement('div');
    allMetrics.style.marginTop = '1.5rem';
    allMetrics.innerHTML = '<h4 style="margin-bottom: 0.75rem;">Detailed Metrics</h4>';
    
    Object.entries(category.metrics).forEach(([key, value]) => {
      const metric = createElement('div');
      metric.style.display = 'flex';
      metric.style.justifyContent = 'space-between';
      metric.style.fontSize = '0.875rem';
      metric.style.marginTop = '0.5rem';
      metric.style.padding = '0.5rem';
      metric.style.background = 'rgba(255, 255, 255, 0.02)';
      metric.style.borderRadius = '0.25rem';
      metric.innerHTML = `
        <span style="color: var(--text-secondary);">${formatMetricName(key)}</span>
        <span style="font-weight: 600;">${formatMetricValue(value)}</span>
      `;
      allMetrics.appendChild(metric);
    });
    
    details.appendChild(allMetrics);
  }
  
  return details;
}

function createChartSection(results) {
  const section = createElement('div', 'chart-section');
  
  const header = createElement('div', 'chart-header');
  header.innerHTML = `
    <h2>Category Performance</h2>
    <div class="chart-legend" style="display: flex; gap: 1rem; font-size: 0.875rem;">
      <span style="color: var(--text-secondary);">Performance across all categories</span>
    </div>
  `;
  
  const container = createElement('div', 'chart-container');
  container.innerHTML = '<canvas id="performanceChart"></canvas>';
  
  section.appendChild(header);
  section.appendChild(container);
  
  return section;
}

function createRoleBasedRecommendations(recommendations) {
  const section = createElement('div', 'recommendations');
  
  const title = createElement('h2');
  title.textContent = 'Actionable Recommendations by Role';
  section.appendChild(title);
  
  // Tabs for different roles
  const tabs = createElement('div', 'recommendation-tabs');
  tabs.innerHTML = `
    <button class="tab active" data-role="all">All Teams</button>
    <button class="tab" data-role="design">Designers</button>
    <button class="tab" data-role="dev">Developers</button>
    <button class="tab" data-role="product">Product Owners</button>
  `;
  section.appendChild(tabs);
  
  // Content for each role
  const allContent = createElement('div', 'recommendation-content active');
  allContent.dataset.role = 'all';
  recommendations.slice(0, 5).forEach(rec => {
    allContent.appendChild(createRecommendationItem(rec));
  });
  
  const designContent = createElement('div', 'recommendation-content');
  designContent.dataset.role = 'design';
  const designRecs = recommendations.filter(r => 
    r.title.toLowerCase().includes('design') || 
    r.title.toLowerCase().includes('token') ||
    r.title.toLowerCase().includes('documentation')
  );
  designRecs.forEach(rec => {
    designContent.appendChild(createRecommendationItem(rec));
  });
  
  const devContent = createElement('div', 'recommendation-content');
  devContent.dataset.role = 'dev';
  const devRecs = recommendations.filter(r => 
    r.title.toLowerCase().includes('component') || 
    r.title.toLowerCase().includes('test') ||
    r.title.toLowerCase().includes('tooling') ||
    r.title.toLowerCase().includes('performance')
  );
  devRecs.forEach(rec => {
    devContent.appendChild(createRecommendationItem(rec));
  });
  
  const productContent = createElement('div', 'recommendation-content');
  productContent.dataset.role = 'product';
  const productRecs = recommendations.filter(r => 
    r.title.toLowerCase().includes('governance') || 
    r.title.toLowerCase().includes('process') ||
    r.title.toLowerCase().includes('adoption')
  );
  productRecs.forEach(rec => {
    productContent.appendChild(createRecommendationItem(rec));
  });
  
  section.appendChild(allContent);
  section.appendChild(designContent);
  section.appendChild(devContent);
  section.appendChild(productContent);
  
  return section;
}

function createRecommendationItem(rec) {
  const item = createElement('div', 'recommendation-item');
  
  const icon = createElement('div', 'recommendation-icon');
  icon.style.background = getPriorityGradient(rec.priority);
  icon.textContent = getPriorityIcon(rec.priority);
  
  const content = createElement('div', 'recommendation-content-inner');
  content.innerHTML = `
    <div class="recommendation-title">${rec.title}</div>
    <div class="recommendation-description">${rec.description}</div>
    <div class="recommendation-tags">
      <span class="tag tag-${rec.priority}">Priority: ${rec.priority}</span>
      <span class="tag">Effort: ${rec.effort}</span>
      <span class="tag">Impact: ${rec.impact}</span>
      ${rec.category ? `<span class="tag">${rec.category}</span>` : ''}
    </div>
  `;
  
  item.appendChild(icon);
  item.appendChild(content);
  
  return item;
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
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
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

function setupInteractions() {
  // Make metric cards expandable
  const metricCards = document.querySelectorAll('.metric-card');
  metricCards.forEach(card => {
    card.addEventListener('click', function() {
      // Close other expanded cards
      metricCards.forEach(c => {
        if (c !== this) c.classList.remove('expanded');
      });
      this.classList.toggle('expanded');
    });
  });
  
  // Tab switching for recommendations
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.recommendation-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const role = this.dataset.role;
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      
      // Show corresponding content
      contents.forEach(content => {
        if (content.dataset.role === role) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });
    });
  });
}

function renderCharts(results) {
  const ctx = document.getElementById('performanceChart').getContext('2d');
  
  // Create a more visually appealing chart
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: results.categories.map(cat => cat.name),
      datasets: [{
        label: 'Score',
        data: results.categories.map(cat => cat.score),
        backgroundColor: results.categories.map(cat => {
          if (cat.score >= 80) return 'rgba(16, 185, 129, 0.8)';
          if (cat.score >= 60) return 'rgba(245, 158, 11, 0.8)';
          return 'rgba(239, 68, 68, 0.8)';
        }),
        borderColor: results.categories.map(cat => {
          if (cat.score >= 80) return '#10b981';
          if (cat.score >= 60) return '#f59e0b';
          return '#ef4444';
        }),
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
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
          },
          callbacks: {
            label: function(context) {
              return context.parsed.y + '/100';
            }
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
            },
            stepSize: 20
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          }
        },
        x: {
          ticks: {
            color: 'rgba(255, 255, 255, 0.5)',
            font: {
              size: 11
            },
            maxRotation: 45,
            minRotation: 45
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}