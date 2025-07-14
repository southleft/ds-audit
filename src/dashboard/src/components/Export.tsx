import React, { useState } from 'react';
import { Card, Title, Text, Button, Group, Select, Checkbox, Stack, Divider, Badge } from '@mantine/core';
import { FileText, FileBarChart, Link, BarChart3 } from 'lucide-react';
import { AuditResult } from '@types';
import { exportData, ExportFormat } from '../utils/dataExport';
import { exportToPDF, ExportOptions } from '../utils/pdfExport';
import './Export.css';

interface ExportProps {
  auditResult: AuditResult;
}

const Export: React.FC<ExportProps> = ({ auditResult }) => {
  const [dataFormat, setDataFormat] = useState<ExportFormat>('json');
  const [pdfSections, setPdfSections] = useState({
    overview: true,
    categories: true,
    recommendations: true
  });
  const [includeCharts, setIncludeCharts] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const handleDataExport = () => {
    exportData(auditResult, dataFormat);
  };

  const handlePDFExport = async () => {
    setIsExporting(true);
    try {
      const sections = Object.entries(pdfSections)
        .filter(([_, enabled]) => enabled)
        .map(([section]) => section);
      
      await exportToPDF(auditResult, {
        sections,
        includeCharts
      });
    } catch (error) {
      console.error('PDF export failed:', error);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportFormats = [
    { value: 'json', label: 'JSON', description: 'Complete audit data in JSON format' },
    { value: 'csv', label: 'CSV', description: 'Category scores and metrics in spreadsheet format' },
    { value: 'markdown', label: 'Markdown', description: 'Formatted report for documentation' }
  ];

  return (
    <div className="export-container">
      {/* Page Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Text size="xs" c="dimmed" fw={500} tt="uppercase" mb={4}>Tools</Text>
        <Title order={1} size="h2">Export</Title>
      </div>

      <div className="export-grid">
        <Card className="export-card">
          <Group gap="xs" mb="md">
            <FileText size={20} color="var(--mantine-color-blue-6)" />
            <Title order={4}>Data Export</Title>
          </Group>
          <Text size="sm" c="dimmed" mb="lg">
            Export audit data in various formats for further analysis or sharing.
          </Text>

          <Select
            label="Export Format"
            value={dataFormat}
            onChange={(value) => setDataFormat(value as ExportFormat)}
            data={exportFormats.map(f => ({
              value: f.value,
              label: f.label
            }))}
            mb="md"
          />

          <div className="format-description">
            {exportFormats.find(f => f.value === dataFormat)?.description}
          </div>

          <Button 
            fullWidth 
            onClick={handleDataExport}
            variant="filled"
            mt="xl"
          >
            Download {dataFormat.toUpperCase()}
          </Button>
        </Card>

        <Card className="export-card">
          <Group gap="xs" mb="md">
            <FileBarChart size={20} color="var(--mantine-color-blue-6)" />
            <Title order={4}>PDF Report</Title>
          </Group>
          <Text size="sm" c="dimmed" mb="lg">
            Generate a comprehensive PDF report with customizable sections.
          </Text>

          <Text size="sm" fw={600} mb="sm">Include Sections:</Text>
          <Stack gap="sm" mb="md">
            <Checkbox
              label="Executive Overview"
              checked={pdfSections.overview}
              onChange={(e) => setPdfSections(prev => ({
                ...prev,
                overview: e.currentTarget.checked
              }))}
            />
            <Checkbox
              label="Category Analysis"
              checked={pdfSections.categories}
              onChange={(e) => setPdfSections(prev => ({
                ...prev,
                categories: e.currentTarget.checked
              }))}
            />
            <Checkbox
              label="Recommendations"
              checked={pdfSections.recommendations}
              onChange={(e) => setPdfSections(prev => ({
                ...prev,
                recommendations: e.currentTarget.checked
              }))}
            />
          </Stack>

          <Divider my="md" />

          <Checkbox
            label="Include charts and visualizations"
            checked={includeCharts}
            onChange={(e) => setIncludeCharts(e.currentTarget.checked)}
            mb="xl"
          />

          <Button 
            fullWidth 
            onClick={handlePDFExport}
            loading={isExporting}
            variant="filled"
            color="blue"
          >
            Generate PDF Report
          </Button>
        </Card>

        <Card className="export-card">
          <Group gap="xs" mb="md">
            <Link size={20} color="var(--mantine-color-blue-6)" />
            <Title order={4}>Quick Links</Title>
          </Group>
          <Text size="sm" c="dimmed" mb="lg">
            Direct access to generated audit files.
          </Text>

          <Stack gap="md">
            <div className="quick-link">
              <Group justify="space-between">
                <Text size="sm">Markdown Report</Text>
                <Badge size="sm" color="green">Available</Badge>
              </Group>
              <Text size="xs" c="dimmed">audit/report.md</Text>
              <Button 
                size="xs" 
                variant="light" 
                fullWidth
                mt="xs"
                onClick={() => window.open('/audit/report.md', '_blank')}
              >
                Open
              </Button>
            </div>

            <div className="quick-link">
              <Group justify="space-between">
                <Text size="sm">JSON Results</Text>
                <Badge size="sm" color="green">Available</Badge>
              </Group>
              <Text size="xs" c="dimmed">audit/results.json</Text>
              <Button 
                size="xs" 
                variant="light" 
                fullWidth
                mt="xs"
                onClick={() => window.open('/audit/results.json', '_blank')}
              >
                Open
              </Button>
            </div>
          </Stack>
        </Card>

        <Card className="export-card">
          <Group gap="xs" mb="md">
            <BarChart3 size={20} color="var(--mantine-color-blue-6)" />
            <Title order={4}>Export Summary</Title>
          </Group>
          <Text size="sm" c="dimmed" mb="lg">
            Current audit snapshot for quick reference.
          </Text>

          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm">Audit Date</Text>
              <Text size="sm" fw={600}>
                {new Date(auditResult.timestamp).toLocaleDateString()}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm">Overall Score</Text>
              <Text size="sm" fw={600}>
                {auditResult.overallScore} / 100
              </Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm">Categories</Text>
              <Text size="sm" fw={600}>
                {auditResult.categories.length}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm">Files Scanned</Text>
              <Text size="sm" fw={600}>
                {auditResult.metadata.filesScanned}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm">Recommendations</Text>
              <Text size="sm" fw={600}>
                {auditResult.recommendations.length}
              </Text>
            </Group>
          </Stack>

          <Button 
            fullWidth 
            variant="light"
            mt="xl"
            onClick={() => {
              const summary = `Design System Audit Summary\n` +
                `Date: ${new Date(auditResult.timestamp).toLocaleDateString()}\n` +
                `Score: ${auditResult.overallScore}/100 (Grade ${auditResult.overallGrade})\n` +
                `View full report: ${window.location.origin}`;
              navigator.clipboard.writeText(summary);
              alert('Summary copied to clipboard!');
            }}
          >
            Copy Summary
          </Button>
        </Card>
      </div>
    </div>
  );
};

export default Export;