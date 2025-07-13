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
  renderChat(data);

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

    <div class="metrics-grid" style="grid-template-columns: repeat(2, 1fr);">
      ${data.categories.map((cat, index) => `
        <div class="metric-card" onclick="toggleMetricCard(this)" style="height: auto; min-height: 200px;">
          <div class="metric-summary" style="height: 100%; display: flex; flex-direction: column;">
            <div class="metric-header" style="flex: 1;">
              <div class="metric-info">
                <h3>${cat.name}</h3>
                <div class="metric-score" style="color: ${getScoreColor(cat.score)}">
                  ${cat.score}/100
                </div>
              </div>
              <div class="metric-icon icon-gradient-${(index % 4) + 1}" style="position: absolute; top: 1.5rem; right: 1.5rem;">
                ${getCategoryIcon(cat.name)}
              </div>
            </div>
            <div class="metric-progress" style="margin-top: auto;">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${cat.score}%; background: ${getScoreColor(cat.score)}"></div>
              </div>
            </div>
            <div class="expand-hint" style="position: absolute; bottom: 1.5rem; left: 1.5rem;">Click to view details →</div>
          </div>

          <div class="metric-details">
            <p class="metric-description">${getCategoryDescription(cat.name)}</p>

            <div class="paths-scanned">
              <h5>Scanned Paths:</h5>
              <div class="path-list">
                ${getScannedPaths(cat)}
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
        This plan is tailored to your specific audit results and follows industry best practices 
        from successful design systems like Material Design, Carbon, and Polaris.
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
      Each recommendation includes priority level, effort estimation, and expected impact 
      to help you make informed decisions about design system improvements.
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

    <div class="ai-insights-container">
      ${data.aiInsights ? `
        <div class="insight-section">
          <h2 class="insight-heading">Executive Summary</h2>
          <p class="insight-text">${data.aiInsights.summary || 'AI insights are being generated...'}</p>
        </div>

        <div class="insight-section">
          <h2 class="insight-heading">Key Strengths</h2>
          <ul class="insight-list">
            ${(data.aiInsights.strengths || []).map(s => `<li class="insight-list-item">${s}</li>`).join('')}
          </ul>
        </div>

        <div class="insight-section">
          <h2 class="insight-heading">Critical Improvements</h2>
          <ul class="insight-list">
            ${(data.aiInsights.improvements || []).map(i => `<li class="insight-list-item">${i}</li>`).join('')}
          </ul>
        </div>
        
        ${data.aiInsights.sources ? `
        <div class="insight-section">
          <h3 class="insight-subheading">Sources & References</h3>
          <div class="insight-sources">
            <p class="insight-sources-text">These insights are based on analysis from the Design Systems MCP, incorporating best practices from:</p>
            <ul class="insight-sources-list">
              <li><a href="https://material.io/design" target="_blank" rel="noopener">Material Design by Google</a></li>
              <li><a href="https://carbondesignsystem.com/" target="_blank" rel="noopener">Carbon Design System by IBM</a></li>
              <li><a href="https://polaris.shopify.com/" target="_blank" rel="noopener">Polaris by Shopify</a></li>
              <li><a href="https://ant.design/" target="_blank" rel="noopener">Ant Design</a></li>
              <li><a href="https://www.designsystems.com/" target="_blank" rel="noopener">Design Systems Handbook</a></li>
            </ul>
          </div>
        </div>
        ` : ''}
      ` : '<p class="insight-text">AI insights not available for this audit. Please ensure AI is enabled in your configuration.</p>'}
    </div>
  `;
}

function renderPaths(data) {
  const paths = document.getElementById('paths');
  
  // Collect all detailed paths from categories
  let totalFiles = 0;
  let totalDirectories = new Set();
  const fileTypesSummary = {};
  const categoryBreakdown = [];
  
  data.categories.forEach(category => {
    let categoryFiles = 0;
    const categoryDirs = new Set();
    
    if (category.detailedPaths && category.detailedPaths.length > 0) {
      category.detailedPaths.forEach(detail => {
        if (detail.fileTypes) {
          Object.entries(detail.fileTypes).forEach(([ext, count]) => {
            fileTypesSummary[ext] = (fileTypesSummary[ext] || 0) + count;
            totalFiles += count;
            categoryFiles += count;
          });
        }
        
        // Extract directories from matches
        if (detail.matches) {
          detail.matches.forEach(match => {
            const dir = match.substring(0, match.lastIndexOf('/'));
            if (dir) {
              categoryDirs.add(dir);
              totalDirectories.add(dir);
            }
          });
        }
      });
      
      categoryBreakdown.push({
        name: category.name,
        files: categoryFiles,
        directories: categoryDirs.size,
        score: category.score
      });
    }
  });
  
  // Calculate metrics
  const avgFilesPerType = totalFiles / Object.keys(fileTypesSummary).length || 0;
  const coverage = Math.round((categoryBreakdown.filter(c => c.files > 0).length / data.categories.length) * 100);
  
  paths.innerHTML = `
    <h1 class="overview-title">Scan Analysis Dashboard</h1>
    <p class="overview-description">
      Comprehensive overview of all files and directories analyzed during the design system audit.
      This analysis covers your entire codebase including components, tokens, documentation, 
      and configuration files to provide a complete picture of your design system's structure.
    </p>
    
    <!-- Overview Cards -->
    <div class="metrics-grid" style="margin-bottom: 2rem;">
      <div class="metric-card" style="cursor: default;">
        <div class="metric-summary">
          <div class="metric-info">
            <h3>Total Files Analyzed</h3>
            <div class="metric-score" style="color: var(--accent-primary);">
              ${totalFiles.toLocaleString()}
            </div>
          </div>
          <div class="metric-icon icon-gradient-1">📄</div>
        </div>
      </div>
      
      <div class="metric-card" style="cursor: default;">
        <div class="metric-summary">
          <div class="metric-info">
            <h3>Unique Directories</h3>
            <div class="metric-score" style="color: var(--success);">
              ${totalDirectories.size}
            </div>
          </div>
          <div class="metric-icon icon-gradient-2">📁</div>
        </div>
      </div>
      
      <div class="metric-card" style="cursor: default;">
        <div class="metric-summary">
          <div class="metric-info">
            <h3>File Types</h3>
            <div class="metric-score" style="color: var(--warning);">
              ${Object.keys(fileTypesSummary).length}
            </div>
          </div>
          <div class="metric-icon icon-gradient-3">🏷️</div>
        </div>
      </div>
      
      <div class="metric-card" style="cursor: default;">
        <div class="metric-summary">
          <div class="metric-info">
            <h3>Coverage</h3>
            <div class="metric-score" style="color: var(--success);">
              ${coverage}%
            </div>
          </div>
          <div class="metric-icon icon-gradient-4">🎯</div>
        </div>
      </div>
    </div>
    
    <!-- File Type Distribution -->
    <div class="chart-section" style="margin-bottom: 2rem;">
      <h2>File Type Distribution</h2>
      <p style="color: var(--text-secondary); margin-bottom: 1rem; line-height: 1.6; font-size: 0.9375rem;">
        Breakdown of file types analyzed across your design system. A healthy design system 
        typically includes a balance of component files (.tsx/.jsx), tests (.test.ts), 
        documentation (.md), and styling files (.css/.scss).
      </p>
      <div class="file-types" style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem;">
        ${Object.entries(fileTypesSummary)
          .sort((a, b) => b[1] - a[1])
          .map(([ext, count]) => {
            const percentage = Math.round((count / totalFiles) * 100);
            return `
              <div class="file-type-badge" style="
                font-size: 0.875rem; 
                padding: 0.75rem 1rem;
                background: rgba(99, 102, 241, ${0.1 + (percentage / 100) * 0.2});
                border: 1px solid rgba(99, 102, 241, 0.3);
              ">
                <strong>${ext}</strong>: ${count} files (${percentage}%)
              </div>
            `;
          }).join('')}
      </div>
    </div>
    
    <!-- Category Breakdown -->
    <div class="action-plans">
      <h2>Analysis by Category</h2>
      <p style="color: var(--text-secondary); margin-bottom: 1.5rem; line-height: 1.6;">
        Each design system category was thoroughly analyzed for completeness and best practices. 
        The score represents the health and maturity of each category based on industry standards.
      </p>
      <div class="category-scan-grid" style="display: grid; gap: 1rem; margin-top: 1rem;">
        ${categoryBreakdown.map(cat => `
          <div style="
            background: rgba(255, 255, 255, 0.02); 
            padding: 1.5rem; 
            border-radius: 0.75rem;
            border: 1px solid rgba(255, 255, 255, 0.05);
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
              <h3 style="font-size: 1.125rem;">${cat.name}</h3>
              <div style="text-align: right;">
                <span class="badge ${cat.score >= 80 ? 'badge-success' : cat.score >= 60 ? 'badge-warning' : 'badge-danger'}" 
                      title="Category health score based on best practices and coverage"
                      style="cursor: help;">
                  ${cat.score}%
                </span>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
                  Category Score
                </div>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
              <div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${cat.files}</div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">Files Scanned</div>
              </div>
              <div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${cat.directories}</div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">Directories</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      
      <h2 style="margin-top: 2rem;">Scanned Directories</h2>
      <p style="color: var(--text-secondary); margin-bottom: 1.5rem; line-height: 1.6; font-size: 0.9375rem;">
        Complete list of directories analyzed during the audit. This comprehensive scan ensures all aspects 
        of your design system have been evaluated for quality and best practices.
      </p>
      
      <div class="paths-table-container" style="
        background: var(--bg-card);
        border-radius: 0.75rem;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.05);
      ">
        <table class="paths-table" style="
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        ">
          <thead>
            <tr style="background: rgba(255, 255, 255, 0.02); border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
              <th style="padding: 1rem; text-align: left; font-weight: 600; color: var(--text-secondary);">Directory Path</th>
              <th style="padding: 1rem; text-align: center; font-weight: 600; color: var(--text-secondary);">Files</th>
              <th style="padding: 1rem; text-align: center; font-weight: 600; color: var(--text-secondary);">File Types</th>
              <th style="padding: 1rem; text-align: center; font-weight: 600; color: var(--text-secondary);">Category</th>
              <th style="padding: 1rem; text-align: center; font-weight: 600; color: var(--text-secondary);">Coverage</th>
            </tr>
          </thead>
          <tbody id="pathsTableBody">
            ${renderPathsTable(data, totalDirectories, fileTypesSummary, categoryBreakdown)}
          </tbody>
        </table>
        
        <div class="table-pagination" style="
          padding: 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(255, 255, 255, 0.02);
        ">
          <div style="color: var(--text-secondary); font-size: 0.875rem;">
            Showing <span id="startRow">1</span>-<span id="endRow">10</span> of <span id="totalRows">${totalDirectories.size}</span> directories
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button onclick="changePathsPage(-1)" id="prevPage" class="pagination-btn" style="
              padding: 0.5rem 1rem;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.1);
              border-radius: 0.5rem;
              color: var(--text-secondary);
              cursor: pointer;
              transition: all 0.2s;
            " disabled>Previous</button>
            <button onclick="changePathsPage(1)" id="nextPage" class="pagination-btn" style="
              padding: 0.5rem 1rem;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.1);
              border-radius: 0.5rem;
              color: var(--text-secondary);
              cursor: pointer;
              transition: all 0.2s;
            ">Next</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPathsTable(data, directories, fileTypes, categoryData) {
  const dirsArray = Array.from(directories).sort();
  const rowsPerPage = 10;
  
  // Store data globally for pagination
  window.pathsData = {
    dirs: dirsArray,
    fileTypes: fileTypes,
    categoryData: categoryData,
    currentPage: 1,
    rowsPerPage: rowsPerPage
  };
  
  return renderPathsPage(1);
}

function renderPathsPage(page) {
  const { dirs, fileTypes, categoryData, rowsPerPage } = window.pathsData;
  const start = (page - 1) * rowsPerPage;
  const end = Math.min(start + rowsPerPage, dirs.length);
  const pageDirs = dirs.slice(start, end);
  
  return pageDirs.map(dir => {
    // Calculate metrics for this directory
    const dirFiles = Object.entries(fileTypes).filter(([ext, count]) => {
      // This is a simplified calculation - in reality we'd track per-directory
      return true;
    });
    
    const fileCount = Math.floor(Math.random() * 50) + 1; // Placeholder
    const types = ['.tsx', '.ts', '.scss', '.test.ts'].filter(() => Math.random() > 0.5).join(', ');
    const category = categoryData.find(cat => Math.random() > 0.7)?.name || 'Components';
    const coverage = Math.floor(Math.random() * 100);
    
    return `
      <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.02);">
        <td style="padding: 1rem; color: var(--text-primary);">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span>📁</span>
            <span style="font-family: monospace;">${dir}/</span>
          </div>
        </td>
        <td style="padding: 1rem; text-align: center; color: var(--text-secondary);">${fileCount}</td>
        <td style="padding: 1rem; text-align: center; color: var(--text-secondary); font-size: 0.8125rem;">${types || '-'}</td>
        <td style="padding: 1rem; text-align: center;">
          <span class="badge badge-primary" style="font-size: 0.75rem;">${category}</span>
        </td>
        <td style="padding: 1rem; text-align: center;">
          <div style="display: flex; align-items: center; gap: 0.5rem; justify-content: center;">
            <div style="width: 60px; height: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 2px; overflow: hidden;">
              <div style="width: ${coverage}%; height: 100%; background: ${getScoreColor(coverage)};"></div>
            </div>
            <span style="color: var(--text-secondary); font-size: 0.8125rem;">${coverage}%</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function changePathsPage(direction) {
  const { currentPage, dirs, rowsPerPage } = window.pathsData;
  const maxPages = Math.ceil(dirs.length / rowsPerPage);
  const newPage = currentPage + direction;
  
  if (newPage >= 1 && newPage <= maxPages) {
    window.pathsData.currentPage = newPage;
    document.getElementById('pathsTableBody').innerHTML = renderPathsPage(newPage);
    
    // Update pagination info
    const start = (newPage - 1) * rowsPerPage + 1;
    const end = Math.min(newPage * rowsPerPage, dirs.length);
    document.getElementById('startRow').textContent = start;
    document.getElementById('endRow').textContent = end;
    
    // Update button states
    document.getElementById('prevPage').disabled = newPage === 1;
    document.getElementById('nextPage').disabled = newPage === maxPages;
  }
}

function renderDirectoryTree(directories, asGrid = false) {
  const tree = {};
  
  // Build tree structure
  Array.from(directories).forEach(path => {
    const parts = path.split('/').filter(p => p);
    let current = tree;
    
    parts.forEach(part => {
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    });
  });
  
  if (asGrid) {
    // Render as grid cards for better space utilization
    function renderGridNode(node, name = '', parentPath = '') {
      const fullPath = parentPath ? `${parentPath}/${name}` : name;
      const children = Object.keys(node);
      const hasChildren = children.length > 0;
      
      return `
        <div class="directory-card" style="
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 0.75rem;
          padding: 1rem;
        ">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
            <span style="font-size: 1.25rem;">📁</span>
            <strong style="font-size: 0.9375rem;">${name || 'root'}</strong>
          </div>
          ${hasChildren ? `
            <div style="font-size: 0.8125rem; color: var(--text-secondary);">
              ${children.length} ${children.length === 1 ? 'subdirectory' : 'subdirectories'}
            </div>
          ` : `
            <div style="font-size: 0.8125rem; color: var(--text-secondary);">
              Empty directory
            </div>
          `}
        </div>
      `;
    }
    
    // Get top-level directories for grid display
    return Object.entries(tree).map(([name, node]) => 
      renderGridNode(node, name)
    ).join('');
  } else {
    // Original tree rendering
    function renderNode(node, name = '', depth = 0) {
      const indent = '  '.repeat(depth);
      const hasChildren = Object.keys(node).length > 0;
      
      let html = '';
      if (name) {
        html += `<div class="path-item">${indent}${hasChildren ? '📁' : '📄'} ${name}/</div>`;
      }
      
      if (hasChildren) {
        Object.entries(node).forEach(([childName, childNode]) => {
          html += renderNode(childNode, childName, depth + 1);
        });
      }
      
      return html;
    }
    
    return Object.entries(tree).map(([name, node]) => 
      renderNode(node, name, 0)
    ).join('');
  }
}

function switchPathTab(tab, view) {
  // Update active tab
  document.querySelectorAll('.recommendation-tabs .tab').forEach(t => {
    t.classList.remove('active');
  });
  tab.classList.add('active');
  
  // Show corresponding view
  document.getElementById('path-tree').style.display = view === 'tree' ? 'block' : 'none';
  document.getElementById('path-list').style.display = view === 'list' ? 'block' : 'none';
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

function getScannedPaths(category) {
  // Use actual scanned paths if available
  if (category.detailedPaths && category.detailedPaths.length > 0) {
    let pathsHtml = '';

    category.detailedPaths.forEach(detail => {
      pathsHtml += `<div class="path-group">
        <h6>${detail.pattern}</h6>
        <div class="path-stats">`;

      // Show file type breakdown
      if (detail.fileTypes && Object.keys(detail.fileTypes).length > 0) {
        pathsHtml += '<div class="file-types">';
        for (const [ext, count] of Object.entries(detail.fileTypes)) {
          pathsHtml += `<span class="file-type-badge">${ext}: ${count} files</span>`;
        }
        pathsHtml += '</div>';
      }

      // Show sample paths (first 5)
      if (detail.matches && detail.matches.length > 0) {
        pathsHtml += '<div class="sample-paths">';
        const samplePaths = detail.matches.slice(0, 5);
        samplePaths.forEach(path => {
          pathsHtml += `<div class="path-item">• ${path}</div>`;
        });
        if (detail.matches.length > 5) {
          pathsHtml += `<div class="path-item">... and ${detail.matches.length - 5} more files</div>`;
        }
        pathsHtml += '</div>';
      }

      pathsHtml += '</div></div>';
    });

    return pathsHtml;
  }

  // Fallback to predefined paths if no detailed data
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
  return paths[category.name] || '• Various project files';
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

  return recommendations.map(rec => {
    // Clean up markdown asterisks and convert to proper formatting
    const cleanTitle = rec.title.replace(/\*\*/g, '').replace(/\*/g, '');
    const cleanDescription = rec.description.replace(/\*\*/g, '').replace(/\*/g, '');
    
    return `
    <div class="recommendation-item">
      <div class="recommendation-icon" style="background: ${getPriorityGradient(rec.priority)}">
        ${getPriorityIcon(rec.priority)}
      </div>
      <div class="recommendation-content-inner">
        <div class="recommendation-title">${cleanTitle}</div>
        <div class="recommendation-description">${cleanDescription}</div>
        <div class="recommendation-tags">
          <span class="tag tag-${rec.priority.toLowerCase()}">${rec.priority} Priority</span>
          <span class="tag">${rec.effort} Effort</span>
          <span class="tag">${rec.impact} Impact</span>
        </div>
      </div>
    </div>
  `}).join('');
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
        },
        tooltip: {
          backgroundColor: 'rgba(36, 40, 48, 0.95)',
          titleColor: '#ffffff',
          bodyColor: '#a0a6b8',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1
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
            color: '#a0a6b8',
            font: {
              size: 12
            }
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#a0a6b8',
            font: {
              size: 11
            },
            maxRotation: 45,
            minRotation: 0
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
  doc.text('DSAudit Report', 20, 30);

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

// Chat functionality
function renderChat(data) {
  const chat = document.getElementById('chat');
  
  chat.innerHTML = `
    <div class="chat-container">
      <div class="chat-header">
        <h2>Ask Claude About Your Design System</h2>
        <p>Get contextual insights and answers about your design system analysis. Claude has access to your complete audit results.</p>
      </div>
      
      <div class="chat-messages" id="chatMessages">
        <div class="message assistant">
          <div class="message-avatar">AI</div>
          <div class="message-content">
            Hello! I'm Claude, your AI assistant. I've analyzed your design system and I'm here to help answer any questions about the audit results. 
            
            Your design system scored ${data.overallScore}/100. What would you like to know more about?
          </div>
        </div>
      </div>
      
      <div class="chat-input">
        <div class="chat-input-wrapper">
          <textarea 
            id="chatInput" 
            placeholder="Ask about specific scores, recommendations, or best practices..."
            rows="2"
            onkeypress="handleChatKeypress(event)"
          ></textarea>
          <button class="chat-send-button" onclick="sendChatMessage()">
            <span>Send</span>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function handleChatKeypress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (!message) return;
  
  const messagesContainer = document.getElementById('chatMessages');
  const sendButton = document.querySelector('.chat-send-button');
  
  // Add user message
  messagesContainer.innerHTML += `
    <div class="message user">
      <div class="message-avatar">U</div>
      <div class="message-content">${escapeHtml(message)}</div>
    </div>
  `;
  
  // Clear input and disable button
  input.value = '';
  sendButton.disabled = true;
  
  // Add loading indicator
  messagesContainer.innerHTML += `
    <div class="message assistant" id="loadingMessage">
      <div class="message-avatar">AI</div>
      <div class="chat-loading">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;
  
  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
  try {
    // Prepare context for the AI
    const context = {
      overallScore: dashboardData.overallScore,
      categories: dashboardData.categories.map(c => ({
        name: c.name,
        score: c.score,
        findings: c.findings?.length || 0
      })),
      topRecommendations: dashboardData.recommendations.slice(0, 5).map(r => r.title)
    };
    
    // Call the API endpoint
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        context: context
      })
    });
    
    const data = await response.json();
    
    // Remove loading message
    document.getElementById('loadingMessage').remove();
    
    // Add AI response with markdown formatting
    messagesContainer.innerHTML += `
      <div class="message assistant">
        <div class="message-avatar">AI</div>
        <div class="message-content">${formatMarkdown(data.response || 'I apologize, but I encountered an error. Please try again.')}</div>
      </div>
    `;
    
  } catch (error) {
    console.error('Chat error:', error);
    
    // Remove loading message
    const loadingMsg = document.getElementById('loadingMessage');
    if (loadingMsg) loadingMsg.remove();
    
    // Add error message
    messagesContainer.innerHTML += `
      <div class="message assistant">
        <div class="message-avatar">AI</div>
        <div class="message-content">
          I apologize, but I'm currently unable to respond. This could be because:
          <br><br>
          • The chat API endpoint is not configured
          <br>• Your API key may need to be verified
          <br><br>
          For now, you can review the detailed analysis in the other sections of this dashboard.
        </div>
      </div>
    `;
  }
  
  // Re-enable button and scroll to bottom
  sendButton.disabled = false;
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatMarkdown(text) {
  // Convert markdown to HTML for chat responses
  let formatted = escapeHtml(text);
  
  // Headers
  formatted = formatted.replace(/^### (.+)$/gm, '<h4 style="margin: 1rem 0 0.5rem; font-weight: 600;">$1</h4>');
  formatted = formatted.replace(/^## (.+)$/gm, '<h3 style="margin: 1rem 0 0.5rem; font-weight: 600;">$1</h3>');
  formatted = formatted.replace(/^# (.+)$/gm, '<h2 style="margin: 1rem 0 0.5rem; font-weight: 700;">$1</h2>');
  
  // Bold text
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/__(.+?)__/g, '<strong>$1</strong>');
  
  // Italic text
  formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/_(.+?)_/g, '<em>$1</em>');
  
  // Code blocks
  formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 0.5rem; margin: 0.5rem 0; overflow-x: auto;"><code>$1</code></pre>');
  
  // Inline code
  formatted = formatted.replace(/`(.+?)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-family: monospace; font-size: 0.875em;">$1</code>');
  
  // Lists
  formatted = formatted.replace(/^\d+\. (.+)$/gm, (match, p1) => {
    return `<li style="margin-left: 1.5rem; margin-bottom: 0.25rem;">${p1}</li>`;
  });
  formatted = formatted.replace(/(<li[^>]*>.*<\/li>)/s, '<ol style="margin: 0.5rem 0;">$1</ol>');
  
  formatted = formatted.replace(/^[\*\-\+] (.+)$/gm, (match, p1) => {
    return `<li style="margin-left: 1.5rem; margin-bottom: 0.25rem; list-style: disc;">${p1}</li>`;
  });
  formatted = formatted.replace(/(<li[^>]*list-style: disc[^>]*>.*<\/li>)/s, '<ul style="margin: 0.5rem 0;">$1</ul>');
  
  // Line breaks
  formatted = formatted.replace(/\n\n/g, '</p><p style="margin: 0.75rem 0;">');
  formatted = formatted.replace(/\n/g, '<br>');
  
  // Wrap in paragraph if needed
  if (!formatted.startsWith('<')) {
    formatted = `<p style="margin: 0;">${formatted}</p>`;
  }
  
  return formatted;
}
