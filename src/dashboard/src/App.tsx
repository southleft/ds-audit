import React, { useState, useEffect } from 'react';
import { AppShell, Burger } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Sidebar from './components/Sidebar';
import Overview from './components/Overview';
import Categories from './components/Categories';
import ActionPlan from './components/ActionPlan';
import Recommendations from './components/Recommendations';
import AIInsights from './components/AIInsights';
import Chat from './components/Chat';
import Progress from './components/Progress';
import Export from './components/Export';
import Timeline from './components/Timeline';
import { AuditResult } from '@types';
import { fetchAuditResults } from './utils/api';
import { exportToPDF, exportCurrentView } from './utils/pdfExport';
import './App.css';

type Section = 'overview' | 'categories' | 'action-plan' | 'recommendations' | 'ai-insights' | 'chat' | 'progress' | 'export' | 'timeline';

function App() {
  const [opened, { toggle }] = useDisclosure();
  const [currentSection, setCurrentSection] = useState<Section>('overview');
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAuditResults();
    
    // Handle hash-based navigation
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as Section;
      if (hash && ['overview', 'categories', 'action-plan', 'recommendations', 'ai-insights', 'chat', 'progress', 'export', 'timeline'].includes(hash)) {
        setCurrentSection(hash);
      }
    };
    
    // Handle custom navigation events from overview page
    const handleNavigateToCategory = (event: CustomEvent) => {
      setCurrentSection('categories');
      // Store the category name for highlighting
      sessionStorage.setItem('highlightCategory', event.detail.categoryName);
    };
    
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('navigateToCategory', handleNavigateToCategory as EventListener);
    
    // Check initial hash
    handleHashChange();
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('navigateToCategory', handleNavigateToCategory as EventListener);
    };
  }, []);

  const loadAuditResults = async () => {
    try {
      setLoading(true);
      const results = await fetchAuditResults();
      setAuditResult(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit results');
    } finally {
      setLoading(false);
    }
  };

  const renderSection = () => {
    if (loading) {
      return <div className="loading">Loading audit results...</div>;
    }

    if (error || !auditResult) {
      return <div className="error">Error: {error || 'No audit results available'}</div>;
    }

    switch (currentSection) {
      case 'overview':
        return <Overview auditResult={auditResult} />;
      case 'categories':
        return <Categories auditResult={auditResult} />;
      case 'action-plan':
        return <ActionPlan auditResult={auditResult} />;
      case 'recommendations':
        return <Recommendations auditResult={auditResult} />;
      case 'ai-insights':
        return <AIInsights auditResult={auditResult} />;
      case 'chat':
        return <Chat auditResult={auditResult} />;
      case 'progress':
        return <Progress />;
      case 'export':
        return <Export auditResult={auditResult} />;
      case 'timeline':
        return <Timeline auditResult={auditResult} />;
      default:
        return <Overview auditResult={auditResult} />;
    }
  };

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 280,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <div className="header">
          <Burger
            opened={opened}
            onClick={toggle}
            hiddenFrom="sm"
            size="sm"
          />
          <h1>Design System Audit Dashboard</h1>
          {auditResult && (
            <div className="header-score">
              <div className="score-display">
                <span className="score-number">{auditResult.overallScore}</span>
                <span className="score-grade">Grade {auditResult.overallGrade}</span>
              </div>
            </div>
          )}
        </div>
      </AppShell.Header>

      <AppShell.Navbar>
        <Sidebar 
          currentSection={currentSection} 
          onSectionChange={setCurrentSection}
          auditResult={auditResult}
        />
      </AppShell.Navbar>

      <AppShell.Main>
        {renderSection()}
      </AppShell.Main>
    </AppShell>
  );
}

export default App;