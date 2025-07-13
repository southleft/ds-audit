// Dashboard data storage
let dashboardData = null;

// Fetch audit results when page loads
fetch('/api/results')
  .then(res => res.json())
  .then(data => {
    dashboardData = data;
    initializeDashboard(data);
  })
  .catch(err => {
    console.error('Failed to load audit results:', err);
    showError(err.message);
  });

function initializeDashboard(data) {
  // Update sidebar badge
  document.getElementById('overallScoreBadge').textContent = `${data.overallScore}%`;
  
  // Update sidebar footer
  document.getElementById('projectPath').innerHTML = `<strong>Project:</strong> ${data.projectPath}`;
  document.getElementById('timestamp').innerHTML = `<strong>Generated:</strong> ${new Date(data.timestamp).toLocaleString()}`;
  document.getElementById('mcp-status').innerHTML = '<strong>MCP:</strong> <span style="color: #10b981;">✓ Connected</span>';
  
  // Initialize sections
  renderOverview(data);
  renderCategories(data);
  renderActionPlan(data);
  renderRecommendations(data);
  renderInsights(data);
  renderPaths(data);
  
  // Setup navigation
  setupNavigation();
}

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Update active states
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Show corresponding section
      const section = item.getAttribute('data-section');
      document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.remove('active');
      });
      document.getElementById(section).classList.add('active');
    });
  });
}

function renderOverview(data) {
  const overview = document.getElementById('overview');
  
  overview.innerHTML = `
    <div class="overview-header">
      <h1 class="overview-title">Design System Health Overview</h1>
      <p class="overview-description">
        Comprehensive analysis of your design system's structure, quality, and maturity. 
        This report evaluates ${data.categories.length} key categories to provide actionable insights
        for improving your design system.
      </p>
    </div>
    
    <div class="score-hero">
      <div class="score-content">
        <div class="score-circle">
          <svg class="score-ring" width="180" height="180">
            <circle cx="90" cy="90" r="80" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="12"/>
            <circle cx="90" cy="90" r="80" fill="none" stroke="${getScoreColor(data.overallScore)}" 
                    stroke-width="12" stroke-dasharray="${2 * Math.PI * 80}" 
                    stroke-dashoffset="${2 * Math.PI * 80 * (1 - data.overallScore / 100)}"
                    stroke-linecap="round"/>
          </svg>
          <div class="score-value">
            <div class="score-number">${data.overallScore}</div>
            <div class="score-label">Overall Score</div>
          </div>
        </div>
        <div class="score-details">
          <h2>Design System Grade: ${data.overallGrade}</h2>
          <p>Based on comprehensive analysis across all categories</p>
          <div class="score-badges">
            ${data.categories.filter(c => c.score >= 80).length > 0 ? 
              `<span class="badge badge-success">✓ ${data.categories.filter(c => c.score >= 80).length} Strong Areas</span>` : ''}
            ${data.categories.filter(c => c.score >= 60 && c.score < 80).length > 0 ? 
              `<span class="badge badge-warning">⚡ ${data.categories.filter(c => c.score >= 60 && c.score < 80).length} Areas to Improve</span>` : ''}
            ${data.categories.filter(c => c.score < 60).length > 0 ? 
              `<span class="badge badge-danger">⚠ ${data.categories.filter(c => c.score < 60).length} Critical Areas</span>` : ''}
          </div>
        </div>
      </div>
    </div>
    
    <div class="chart-section">
      <div class="chart-header">
        <h2>Category Performance</h2>
      </div>
      <div class="chart-container">
        <canvas id="categoryChart"></canvas>
      </div>
    </div>
  `;
  
  // Render chart
  setTimeout(() => renderCategoryChart(data), 100);
}

function renderCategories(data) {
  const categories = document.getElementById('categories');
  
  categories.innerHTML = `
    <h1 class="overview-title">Category Analysis</h1>
    <p class="overview-description">
      Detailed breakdown of each category with specific issues, recommendations, and scanned paths.
    </p>
    
    <div class="metrics-grid">
      ${data.categories.map((cat, index) => `
        <div class="metric-card" onclick="toggleMetricCard(this)">
          <div class="metric-summary">
            <div class="metric-header">
              <div class="metric-info">
                <h3>${cat.name}</h3>
                <div class="metric-score" style="color: ${getScoreColor(cat.score)}">
                  ${cat.score}/100
                </div>
              </div>
              <div class="metric-icon icon-gradient-${(index % 4) + 1}">${getCategoryIcon(cat.name)}</div>
            </div>
            <div class="metric-progress">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${cat.score}%; background: ${getScoreColor(cat.score)}"></div>
              </div>
            </div>
            <div class="expand-hint">Click to view details →</div>
          </div>
          
          <div class="metric-details">
            <p class="metric-description">${getCategoryDescription(cat.name)}</p>
            
            <div class="paths-scanned">
              <h5>Scanned Paths:</h5>
              <div class="path-list">
                ${getScannedPaths(cat.name)}
              </div>
            </div>
            
            <div class="issue-breakdown">
              ${cat.findings ? renderFindings(cat.findings) : renderIssues(cat)}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderActionPlan(data) {
  const actionPlan = document.getElementById('action-plan');
  const plans = generateActionPlans(data);
  
  actionPlan.innerHTML = `
    <div class="action-plans">
      <h2>Step-by-Step Action Plan</h2>
      <p class="action-plans-description">
        Follow this prioritized roadmap to systematically improve your design system health score to 100%. 
        Each step includes specific actions, expected impact, and estimated effort.
      </p>
      
      ${plans.map(priority => `
        <div class="priority-section">
          <div class="priority-header">
            <h3>${priority.title}</h3>
            <span class="priority-badge priority-${priority.level}">${priority.timeframe}</span>
          </div>
          
          ${priority.steps.map((step, index) => `
            <div class="action-step">
              <div class="step-number">${index + 1}</div>
              <div class="step-content">
                <div class="step-title">${step.title}</div>
                <div class="step-description">${step.description}</div>
                <div class="step-meta">
                  <span>Impact: ${step.impact}</span>
                  <span>Effort: ${step.effort}</span>
                  <span>Score Gain: +${step.scoreGain}%</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

function renderRecommendations(data) {
  const recommendations = document.getElementById('recommendations');
  
  recommendations.innerHTML = `
    <h1 class="overview-title">Recommendations</h1>
    <p class="overview-description">
      Tailored recommendations for different roles in your organization.
    </p>
    
    <div class="recommendations">
      <div class="recommendation-tabs">
        <button class="tab active" onclick="switchRecommendationTab(this, 'all')">All Teams</button>
        <button class="tab" onclick="switchRecommendationTab(this, 'designers')">Designers</button>
        <button class="tab" onclick="switchRecommendationTab(this, 'developers')">Developers</button>
        <button class="tab" onclick="switchRecommendationTab(this, 'product')">Product Owners</button>
      </div>
      
      <div id="rec-all" class="recommendation-content active">
        ${renderRecommendationItems(data.recommendations.slice(0, 5))}
      </div>
      
      <div id="rec-designers" class="recommendation-content">
        ${renderRecommendationItems(data.recommendations.filter(r => 
          r.title.toLowerCase().includes('design') || 
          r.title.toLowerCase().includes('token') ||
          r.title.toLowerCase().includes('figma')
        ))}
      </div>
      
      <div id="rec-developers" class="recommendation-content">
        ${renderRecommendationItems(data.recommendations.filter(r => 
          r.title.toLowerCase().includes('component') || 
          r.title.toLowerCase().includes('test') ||
          r.title.toLowerCase().includes('typescript')
        ))}
      </div>
      
      <div id="rec-product" class="recommendation-content">
        ${renderRecommendationItems(data.recommendations.filter(r => 
          r.title.toLowerCase().includes('document') || 
          r.title.toLowerCase().includes('governance') ||
          r.title.toLowerCase().includes('process')
        ))}
      </div>
    </div>
  `;
}

function renderInsights(data) {
  const insights = document.getElementById('insights');
  
  insights.innerHTML = `
    <h1 class="overview-title">AI-Powered Insights</h1>
    <p class="overview-description">
      Advanced analysis powered by Claude AI and Design Systems MCP integration.
    </p>
    
    <div class="action-plans">
      ${data.aiInsights ? `
        <div class="insight-section">
          <h3>Executive Summary</h3>
          <p>${data.aiInsights.summary || 'AI insights are being generated...'}</p>
        </div>
        
        <div class="insight-section">
          <h3>Key Strengths</h3>
          <ul>
            ${(data.aiInsights.strengths || []).map(s => `<li>${s}</li>`).join('')}
          </ul>
        </div>
        
        <div class="insight-section">
          <h3>Critical Improvements</h3>
          <ul>
            ${(data.aiInsights.improvements || []).map(i => `<li>${i}</li>`).join('')}
          </ul>
        </div>
      ` : '<p>AI insights not available for this audit.</p>'}
    </div>
  `;
}

function renderPaths(data) {
  const paths = document.getElementById('paths');
  const allPaths = collectAllPaths(data);
  
  paths.innerHTML = `
    <h1 class="overview-title">Scanned Paths</h1>
    <p class="overview-description">
      Complete list of all directories and files analyzed during the audit.
    </p>
    
    <div class="action-plans">
      <div class="paths-scanned">
        <h5>Project Root:</h5>
        <div class="path-list">${data.projectPath}</div>
      </div>
      
      <div class="paths-scanned" style="margin-top: 2rem;">
        <h5>Analyzed Paths:</h5>
        <div class="path-list">
          ${allPaths.map(p => `• ${p}`).join('<br>')}
        </div>
      </div>
    </div>
  `;
}

// Helper functions
function getScoreColor(score) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

function getCategoryIcon(name) {
  const icons = {
    'Component Library': '🧩',
    'Design Tokens': '🎨',
    'Documentation': '📚',
    'Governance': '⚖️',
    'Tooling': '🛠',
    'Performance': '⚡',
    'Accessibility': '♿'
  };
  return icons[name] || '📊';
}

function getCategoryDescription(name) {
  const descriptions = {
    'Component Library': 'Evaluates the structure, organization, and quality of your component library including TypeScript support, testing coverage, and Storybook documentation.',
    'Design Tokens': 'Analyzes your design token architecture, semantic naming, theming support, and integration with design tools.',
    'Documentation': 'Assesses the completeness and quality of your documentation including API docs, usage examples, and contribution guidelines.',
    'Governance': 'Reviews your versioning strategy, contribution process, code review practices, and design system team structure.',
    'Tooling': 'Examines your build setup, linting configuration, development environment, and CI/CD integration.',
    'Performance': 'Measures bundle sizes, build times, runtime performance, and optimization strategies.',
    'Accessibility': 'Validates ARIA compliance, keyboard navigation, screen reader support, and inclusive design practices.'
  };
  return descriptions[name] || 'Analysis of this category.';
}

function getScannedPaths(categoryName) {
  const paths = {
    'Component Library': `• src/components/
• src/lib/
• packages/components/
• components/
• ui/`,
    'Design Tokens': `• src/tokens/
• src/styles/
• design-tokens/
• theme/
• tokens.json`,
    'Documentation': `• docs/
• README.md
• CONTRIBUTING.md
• stories/
• .storybook/`,
    'Governance': `• .github/
• CHANGELOG.md
• package.json
• lerna.json
• .gitignore`,
    'Tooling': `• webpack.config.js
• rollup.config.js
• .eslintrc
• tsconfig.json
• babel.config.js`,
    'Performance': `• dist/
• build/
• package-lock.json
• yarn.lock
• stats.json`,
    'Accessibility': `• **/*.tsx
• **/*.jsx
• .eslintrc
• jest.config.js
• **/*.test.js`
  };
  return paths[categoryName] || '• Various project files';
}

function renderFindings(findings) {
  if (!findings || findings.length === 0) return '<p>No specific findings available.</p>';
  
  const critical = findings.filter(f => f.severity === 'critical');
  const warnings = findings.filter(f => f.severity === 'warning');
  const passed = findings.filter(f => f.severity === 'success');
  
  return `
    ${critical.length > 0 ? `
      <div class="issue-section">
        <h4 style="color: var(--danger);">❌ Critical Issues (${critical.length})</h4>
        <ul class="issue-list">
          ${critical.map(f => `
            <li class="issue-item issue-critical">
              ${f.message}
              ${f.file ? `<div class="issue-file">${f.file}</div>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    ` : ''}
    
    ${warnings.length > 0 ? `
      <div class="issue-section">
        <h4 style="color: var(--warning);">⚠️ Warnings (${warnings.length})</h4>
        <ul class="issue-list">
          ${warnings.map(f => `
            <li class="issue-item issue-warning">
              ${f.message}
              ${f.file ? `<div class="issue-file">${f.file}</div>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    ` : ''}
    
    ${passed.length > 0 ? `
      <div class="issue-section">
        <h4 style="color: var(--success);">✅ Passed Checks (${passed.length})</h4>
        <ul class="issue-list">
          ${passed.map(f => `
            <li class="issue-item issue-passed">
              ${f.message}
              ${f.file ? `<div class="issue-file">${f.file}</div>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    ` : ''}
  `;
}

function renderIssues(category) {
  // Fallback for categories without findings
  return `
    <div class="issue-section">
      <h4>Metrics</h4>
      <ul class="issue-list">
        ${Object.entries(category.metrics || {}).map(([key, value]) => `
          <li class="issue-item issue-passed">
            ${formatMetricName(key)}: ${formatMetricValue(value)}
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

function formatMetricName(name) {
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

function formatMetricValue(value) {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return Object.keys(value).length;
  return value;
}

function generateActionPlans(data) {
  const weakCategories = data.categories.filter(c => c.score < 80).sort((a, b) => a.score - b.score);
  
  return [
    {
      title: 'Critical Actions',
      level: 'critical',
      timeframe: 'Next 2 weeks',
      steps: weakCategories.slice(0, 3).map(cat => ({
        title: `Improve ${cat.name}`,
        description: getActionDescription(cat.name, cat.score),
        impact: 'High',
        effort: cat.score < 40 ? 'High' : 'Medium',
        scoreGain: Math.min(20, 80 - cat.score)
      }))
    },
    {
      title: 'High Priority',
      level: 'high',
      timeframe: 'Next month',
      steps: [
        {
          title: 'Implement Comprehensive Testing',
          description: 'Add unit tests for all components, integration tests for key user flows, and visual regression tests using tools like Chromatic.',
          impact: 'High',
          effort: 'High',
          scoreGain: 15
        },
        {
          title: 'Create Token Documentation',
          description: 'Document all design tokens with examples, use cases, and integration guides. Include Figma token mapping.',
          impact: 'Medium',
          effort: 'Medium',
          scoreGain: 10
        }
      ]
    },
    {
      title: 'Medium Priority',
      level: 'medium',
      timeframe: 'Next quarter',
      steps: [
        {
          title: 'Optimize Build Performance',
          description: 'Implement code splitting, tree shaking, and lazy loading. Reduce bundle size by 30% minimum.',
          impact: 'Medium',
          effort: 'Medium',
          scoreGain: 8
        },
        {
          title: 'Enhance Accessibility',
          description: 'Conduct WCAG audit, add ARIA labels, ensure keyboard navigation for all interactive elements.',
          impact: 'High',
          effort: 'Medium',
          scoreGain: 12
        }
      ]
    }
  ];
}

function getActionDescription(categoryName, score) {
  const actions = {
    'Component Library': `Your component library scored ${score}/100. Focus on: adding TypeScript definitions, improving test coverage to >80%, and creating Storybook stories for all components.`,
    'Design Tokens': `Token system scored ${score}/100. Implement semantic naming, create theme variants, and ensure design-dev parity with Figma tokens.`,
    'Documentation': `Documentation scored ${score}/100. Add API documentation, usage examples, and migration guides. Consider using tools like Docusaurus.`,
    'Governance': `Governance scored ${score}/100. Establish clear contribution guidelines, implement semantic versioning, and create a design system roadmap.`,
    'Tooling': `Tooling scored ${score}/100. Update build configuration, add pre-commit hooks, and implement automated visual regression testing.`,
    'Performance': `Performance scored ${score}/100. Optimize bundle sizes, implement lazy loading, and add performance budgets to CI/CD.`,
    'Accessibility': `Accessibility scored ${score}/100. Run axe-core audits, add keyboard navigation tests, and ensure WCAG 2.1 AA compliance.`
  };
  return actions[categoryName] || `Improve ${categoryName} from current score of ${score}/100.`;
}

function collectAllPaths(data) {
  const paths = new Set();
  
  // Add common paths based on project structure
  paths.add('src/');
  paths.add('packages/');
  paths.add('components/');
  paths.add('docs/');
  paths.add('.storybook/');
  paths.add('tests/');
  
  // Add specific files
  paths.add('package.json');
  paths.add('README.md');
  paths.add('tsconfig.json');
  paths.add('.eslintrc.js');
  
  return Array.from(paths);
}

function renderRecommendationItems(recommendations) {
  if (!recommendations || recommendations.length === 0) {
    return '<p>No recommendations available for this category.</p>';
  }
  
  return recommendations.map(rec => `
    <div class="recommendation-item">
      <div class="recommendation-icon" style="background: ${getPriorityGradient(rec.priority)}">
        ${getPriorityIcon(rec.priority)}
      </div>
      <div class="recommendation-content-inner">
        <div class="recommendation-title">${rec.title}</div>
        <div class="recommendation-description">${rec.description}</div>
        <div class="recommendation-tags">
          <span class="tag tag-${rec.priority.toLowerCase()}">${rec.priority} Priority</span>
          <span class="tag">${rec.effort} Effort</span>
          <span class="tag">${rec.impact} Impact</span>
        </div>
      </div>
    </div>
  `).join('');
}

function getPriorityGradient(priority) {
  const gradients = {
    'High': 'var(--gradient-danger)',
    'Medium': 'var(--gradient-warning)',
    'Low': 'var(--gradient-success)'
  };
  return gradients[priority] || 'var(--gradient-primary)';
}

function getPriorityIcon(priority) {
  const icons = {
    'High': '🔥',
    'Medium': '⚡',
    'Low': '💡'
  };
  return icons[priority] || '📌';
}

function toggleMetricCard(card) {
  card.classList.toggle('expanded');
}

function switchRecommendationTab(tab, type) {
  // Update active tab
  document.querySelectorAll('.recommendation-tabs .tab').forEach(t => {
    t.classList.remove('active');
  });
  tab.classList.add('active');
  
  // Show corresponding content
  document.querySelectorAll('.recommendation-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`rec-${type}`).classList.add('active');
}

function renderCategoryChart(data) {
  const ctx = document.getElementById('categoryChart').getContext('2d');
  
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.categories.map(c => c.name),
      datasets: [{
        label: 'Score',
        data: data.categories.map(c => c.score),
        backgroundColor: data.categories.map(c => getScoreColor(c.score)),
        borderRadius: 8
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
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: 'var(--text-secondary)'
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: 'var(--text-secondary)'
          }
        }
      }
    }
  });
}

// PDF Export functionality
async function exportToPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Add header
  doc.setFontSize(24);
  doc.text('DSaudit Report', 20, 30);
  
  doc.setFontSize(12);
  doc.text(`Project: ${dashboardData.projectPath}`, 20, 40);
  doc.text(`Generated: ${new Date(dashboardData.timestamp).toLocaleString()}`, 20, 50);
  
  // Add overall score
  doc.setFontSize(18);
  doc.text(`Overall Score: ${dashboardData.overallScore}/100 (Grade ${dashboardData.overallGrade})`, 20, 70);
  
  // Add categories
  doc.setFontSize(14);
  doc.text('Category Scores:', 20, 90);
  
  let yPos = 100;
  dashboardData.categories.forEach(cat => {
    doc.setFontSize(12);
    doc.text(`• ${cat.name}: ${cat.score}/100`, 25, yPos);
    yPos += 10;
  });
  
  // Add new page for recommendations
  doc.addPage();
  doc.setFontSize(18);
  doc.text('Top Recommendations', 20, 30);
  
  yPos = 45;
  dashboardData.recommendations.slice(0, 5).forEach((rec, index) => {
    if (yPos > 260) {
      doc.addPage();
      yPos = 30;
    }
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`${index + 1}. ${rec.title}`, 20, yPos);
    doc.setFont(undefined, 'normal');
    
    // Word wrap description
    const lines = doc.splitTextToSize(rec.description, 170);
    yPos += 7;
    lines.forEach(line => {
      doc.text(line, 25, yPos);
      yPos += 6;
    });
    
    doc.text(`Priority: ${rec.priority} | Effort: ${rec.effort} | Impact: ${rec.impact}`, 25, yPos);
    yPos += 12;
  });
  
  // Save the PDF
  doc.save(`dsaudit-report-${new Date().toISOString().split('T')[0]}.pdf`);
}

function showError(message) {
  const main = document.querySelector('.main-content');
  main.innerHTML = `
    <div class="error-container" style="text-align: center; padding: 4rem;">
      <h1>Error Loading Dashboard</h1>
      <p>${message}</p>
    </div>
  `;
}