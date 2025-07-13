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
    // Show error message on page
    const root = document.getElementById('root');
    root.innerHTML = `
      <div class="container">
        <div class="card" style="background: #fee; border: 1px solid #fcc; padding: 20px;">
          <h2>Error Loading Dashboard</h2>
          <p>Failed to load audit results from the API.</p>
          <pre>${err.message}</pre>
          <p>Please check the console for more details.</p>
        </div>
      </div>
    `;
  });

function renderDashboard(results) {
  const root = document.getElementById('root');
  
  // Create main structure
  const container = createElement('div', 'container');
  
  // Header section
  const header = createHeader(results);
  container.appendChild(header);
  
  // Category scores chart
  const chartCard = createElement('div', 'card');
  chartCard.innerHTML = `
    <h3>Category Scores</h3>
    <div class="chart-container">
      <canvas id="radarChart"></canvas>
    </div>
  `;
  container.appendChild(chartCard);
  
  // Category cards grid
  const grid = createCategoryGrid(results.categories);
  container.appendChild(grid);
  
  // Recommendations
  const recommendations = createRecommendations(results.recommendations);
  container.appendChild(recommendations);
  
  root.appendChild(container);
  
  // Render charts after DOM is ready
  setTimeout(() => renderCharts(results), 100);
}

function createHeader(results) {
  const header = createElement('div', 'header');
  
  const title = createElement('h1');
  title.textContent = 'Design System Audit Report';
  header.appendChild(title);
  
  const timestamp = createElement('p');
  timestamp.textContent = `Generated: ${new Date(results.timestamp).toLocaleString()}`;
  header.appendChild(timestamp);
  
  const project = createElement('p');
  project.textContent = `Project: ${results.projectPath}`;
  header.appendChild(project);
  
  // Overall score section
  const scoreSection = createElement('div', 'overall-score');
  
  const scoreCircle = createElement('div', `score-circle score-${results.overallGrade}`);
  const scoreValue = createElement('div');
  scoreValue.textContent = results.overallScore;
  const gradeText = createElement('div');
  gradeText.style.fontSize = '1rem';
  gradeText.style.fontWeight = 'normal';
  gradeText.textContent = `Grade ${results.overallGrade}`;
  scoreCircle.appendChild(scoreValue);
  scoreCircle.appendChild(gradeText);
  
  const scoreInfo = createElement('div');
  const scoreTitle = createElement('h2');
  scoreTitle.textContent = 'Overall Health Score';
  const scoreDesc = createElement('p');
  scoreDesc.textContent = `Based on ${results.categories.length} categories analyzed`;
  scoreInfo.appendChild(scoreTitle);
  scoreInfo.appendChild(scoreDesc);
  
  scoreSection.appendChild(scoreCircle);
  scoreSection.appendChild(scoreInfo);
  header.appendChild(scoreSection);
  
  return header;
}

function createCategoryGrid(categories) {
  const grid = createElement('div', 'grid');
  
  categories.forEach(cat => {
    const card = createElement('div', 'card');
    
    const title = createElement('h3');
    title.textContent = cat.name;
    card.appendChild(title);
    
    // Score metric
    const scoreMetric = createMetric('Score', `${cat.score}/100 (${cat.grade})`);
    card.appendChild(scoreMetric);
    
    // Other metrics
    Object.entries(cat.metrics).slice(0, 3).forEach(([key, value]) => {
      const metric = createMetric(formatMetricName(key), formatMetricValue(value));
      card.appendChild(metric);
    });
    
    grid.appendChild(card);
  });
  
  return grid;
}

function createRecommendations(recommendations) {
  const card = createElement('div', 'card');
  
  const title = createElement('h3');
  title.textContent = 'Top Recommendations';
  card.appendChild(title);
  
  recommendations.slice(0, 5).forEach(rec => {
    const finding = createElement('div', 'finding finding-warning');
    
    const recTitle = createElement('h4');
    recTitle.textContent = rec.title;
    finding.appendChild(recTitle);
    
    const desc = createElement('p');
    desc.textContent = rec.description;
    finding.appendChild(desc);
    
    const meta = createElement('div');
    meta.style.marginTop = '10px';
    meta.style.fontSize = '0.9rem';
    meta.style.color = '#666';
    meta.textContent = `Priority: ${rec.priority} | Effort: ${rec.effort} | Impact: ${rec.impact}`;
    finding.appendChild(meta);
    
    card.appendChild(finding);
  });
  
  return card;
}

function createMetric(label, value) {
  const metric = createElement('div', 'metric');
  
  const labelSpan = createElement('span');
  labelSpan.textContent = label;
  
  const valueStrong = createElement('strong');
  valueStrong.textContent = value;
  
  metric.appendChild(labelSpan);
  metric.appendChild(valueStrong);
  
  return metric;
}

function createElement(tag, className) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  return element;
}

function formatMetricName(name) {
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

function formatMetricValue(value) {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return Object.keys(value).length;
  return value;
}

function renderCharts(results) {
  const canvas = document.getElementById('radarChart');
  const ctx = canvas.getContext('2d');
  
  // Set explicit canvas size
  canvas.width = 600;
  canvas.height = 400;
  
  new Chart(ctx, {
    type: 'radar',
    data: {
      labels: results.categories.map(cat => cat.name),
      datasets: [{
        label: 'Score',
        data: results.categories.map(cat => cat.score),
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderColor: 'rgb(59, 130, 246)',
        pointBackgroundColor: 'rgb(59, 130, 246)',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgb(59, 130, 246)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
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
            stepSize: 20
          }
        }
      }
    }
  });
}