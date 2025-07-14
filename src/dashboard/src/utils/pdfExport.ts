import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { AuditResult } from '@types';

export interface ExportOptions {
  filename?: string;
  sections?: string[];
  includeCharts?: boolean;
  pageSize?: 'a4' | 'letter';
}

export async function exportToPDF(
  auditResult: AuditResult,
  options: ExportOptions = {}
): Promise<void> {
  const {
    filename = `audit-report-${new Date().toISOString().split('T')[0]}.pdf`,
    sections = ['overview', 'categories', 'recommendations'],
    includeCharts = true,
    pageSize = 'a4'
  } = options;

  // Create a temporary container for rendering
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.width = pageSize === 'a4' ? '210mm' : '8.5in';
  container.style.padding = '20px';
  container.style.background = 'white';
  container.style.color = 'black';
  container.className = 'pdf-export-container';
  document.body.appendChild(container);

  try {
    // Build the PDF content
    container.innerHTML = `
      <style>
        .pdf-export-container * {
          color: black !important;
          background: white !important;
        }
        .pdf-export-container {
          font-family: 'Work Sans', Arial, sans-serif;
          line-height: 1.6;
        }
        .pdf-header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #333;
        }
        .pdf-section {
          margin-bottom: 30px;
          page-break-inside: avoid;
        }
        .pdf-metric {
          display: inline-block;
          margin: 10px;
          padding: 15px;
          border: 1px solid #ddd;
          border-radius: 8px;
          text-align: center;
          min-width: 120px;
        }
        .pdf-category {
          margin-bottom: 20px;
          padding: 15px;
          border: 1px solid #ddd;
          border-radius: 8px;
        }
        .pdf-recommendation {
          margin-bottom: 15px;
          padding: 10px;
          background: #f5f5f5;
          border-left: 4px solid #333;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        th, td {
          padding: 10px;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }
        th {
          background: #f5f5f5;
          font-weight: bold;
        }
      </style>
    `;

    // Header
    container.innerHTML += `
      <div class="pdf-header">
        <h1>Design System Audit Report</h1>
        <p><strong>Project:</strong> ${auditResult.projectPath}</p>
        <p><strong>Date:</strong> ${new Date(auditResult.timestamp).toLocaleDateString()}</p>
        <p><strong>Overall Score:</strong> ${auditResult.overallScore} / 100 (Grade ${auditResult.overallGrade})</p>
      </div>
    `;

    // Overview Section
    if (sections.includes('overview')) {
      container.innerHTML += `
        <div class="pdf-section">
          <h2>Executive Summary</h2>
          <div>
            <div class="pdf-metric">
              <h3>${auditResult.overallScore}</h3>
              <p>Overall Score</p>
            </div>
            <div class="pdf-metric">
              <h3>${auditResult.overallGrade}</h3>
              <p>Grade</p>
            </div>
            <div class="pdf-metric">
              <h3>${auditResult.metadata.filesScanned}</h3>
              <p>Files Scanned</p>
            </div>
            <div class="pdf-metric">
              <h3>${auditResult.categories.length}</h3>
              <p>Categories</p>
            </div>
          </div>
        </div>
      `;
    }

    // Categories Section
    if (sections.includes('categories')) {
      container.innerHTML += `
        <div class="pdf-section">
          <h2>Category Analysis</h2>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Score</th>
                <th>Grade</th>
                <th>Weight</th>
                <th>Findings</th>
              </tr>
            </thead>
            <tbody>
              ${auditResult.categories.map(cat => `
                <tr>
                  <td>${cat.name}</td>
                  <td>${cat.score}/100</td>
                  <td>${cat.grade}</td>
                  <td>${cat.weight}%</td>
                  <td>${cat.findings?.length || 0}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      // Detailed category information
      auditResult.categories.forEach(category => {
        container.innerHTML += `
          <div class="pdf-category">
            <h3>${category.name} - Score: ${category.score} (Grade ${category.grade})</h3>
            ${category.findings ? `
              <h4>Key Findings:</h4>
              <ul>
                ${category.findings.slice(0, 5).map(f => `
                  <li><strong>${f.type}:</strong> ${f.message}</li>
                `).join('')}
              </ul>
            ` : ''}
          </div>
        `;
      });
    }

    // Recommendations Section
    if (sections.includes('recommendations')) {
      const highPriority = auditResult.recommendations.filter(r => r.priority === 'high');
      const mediumPriority = auditResult.recommendations.filter(r => r.priority === 'medium');
      const lowPriority = auditResult.recommendations.filter(r => r.priority === 'low');

      container.innerHTML += `
        <div class="pdf-section">
          <h2>Recommendations</h2>
          
          ${highPriority.length > 0 ? `
            <h3>High Priority (${highPriority.length})</h3>
            ${highPriority.map(rec => `
              <div class="pdf-recommendation">
                <h4>${rec.title}</h4>
                <p>${rec.description}</p>
                <p><em>Effort: ${rec.effort}</em></p>
              </div>
            `).join('')}
          ` : ''}
          
          ${mediumPriority.length > 0 ? `
            <h3>Medium Priority (${mediumPriority.length})</h3>
            ${mediumPriority.slice(0, 5).map(rec => `
              <div class="pdf-recommendation">
                <h4>${rec.title}</h4>
                <p>${rec.description}</p>
              </div>
            `).join('')}
          ` : ''}
        </div>
      `;
    }

    // Convert to canvas
    const canvas = await html2canvas(container, {
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true
    });

    // Create PDF
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: pageSize
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 20; // 10mm margins
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 10; // Top margin

    // Add first page
    pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
    heightLeft -= (pageHeight - 20);

    // Add additional pages if needed
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= (pageHeight - 20);
    }

    // Save the PDF
    pdf.save(filename);

  } finally {
    // Clean up
    document.body.removeChild(container);
  }
}

// Alternative method using current page content
export async function exportCurrentView(): Promise<void> {
  const mainContent = document.querySelector('.mantine-AppShell-main');
  if (!mainContent) {
    throw new Error('Could not find main content area');
  }

  // Temporarily modify styles for better PDF output
  const originalBackground = document.body.style.background;
  const originalColor = document.body.style.color;
  document.body.style.background = 'white';
  document.body.style.color = 'black';

  try {
    const canvas = await html2canvas(mainContent as HTMLElement, {
      scale: 2,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const imgWidth = 190; // A4 width minus margins
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
    pdf.save(`dashboard-export-${new Date().toISOString().split('T')[0]}.pdf`);

  } finally {
    // Restore original styles
    document.body.style.background = originalBackground;
    document.body.style.color = originalColor;
  }
}