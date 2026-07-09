import React, { useCallback, useEffect, useState } from 'react';
import { Alert, AppShell, Burger, Center, Group, Loader, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Sidebar, { type Section } from './components/Sidebar';
import Overview from './components/Overview';
import Categories from './components/Categories';
import ActionPlan from './components/ActionPlan';
import Progress from './components/Progress';
import Export from './components/Export';
import type { AuditResult } from './types';
import { fetchAuditResults } from './utils/api';

const SECTIONS: Section[] = ['overview', 'categories', 'action-plan', 'progress', 'export'];

function sectionFromHash(): Section | null {
  const hash = window.location.hash.replace('#', '');
  // The old Recommendations view merged into the Action Plan
  if (hash === 'recommendations') return 'action-plan';
  return SECTIONS.includes(hash as Section) ? (hash as Section) : null;
}

function App() {
  const [opened, { toggle, close }] = useDisclosure();
  const [currentSection, setCurrentSection] = useState<Section>(
    () => sectionFromHash() ?? 'overview'
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAuditResults = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);
      const results = await fetchAuditResults(refresh);
      setAuditResult(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit results');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuditResults();
  }, [loadAuditResults]);

  // Hash-based navigation (e.g. the CLI opens /#progress)
  useEffect(() => {
    const handleHashChange = () => {
      const section = sectionFromHash();
      if (section) setCurrentSection(section);
    };
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // With no completed audit yet, the progress view is the only useful one
  useEffect(() => {
    if (!loading && auditResult && (!auditResult.categories || auditResult.categories.length === 0)) {
      if (currentSection !== 'progress') {
        setCurrentSection('progress');
        window.location.hash = 'progress';
      }
    }
  }, [loading, auditResult, currentSection]);

  const navigate = (section: Section) => {
    setCurrentSection(section);
    window.location.hash = section;
    close();
  };

  const openCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    navigate('categories');
  };

  const handleAuditComplete = useCallback(() => {
    // Fresh results from disk, then show the overview
    loadAuditResults(true).then(() => {
      setCurrentSection('overview');
      window.location.hash = 'overview';
    });
  }, [loadAuditResults]);

  const renderSection = () => {
    if (loading) {
      return (
        <Center h={300}>
          <Group gap="sm">
            <Loader size="sm" />
            <Text c="dimmed">Loading audit results...</Text>
          </Group>
        </Center>
      );
    }

    if (error || !auditResult) {
      return (
        <Alert color="red" title="Could not load audit results">
          {error ?? 'No audit results available'}
        </Alert>
      );
    }

    switch (currentSection) {
      case 'overview':
        return <Overview auditResult={auditResult} onSelectCategory={openCategory} />;
      case 'categories':
        return <Categories auditResult={auditResult} initialCategoryId={selectedCategoryId} />;
      case 'action-plan':
        return <ActionPlan auditResult={auditResult} />;
      case 'progress':
        return <Progress auditResult={auditResult} onAuditComplete={handleAuditComplete} />;
      case 'export':
        return <Export auditResult={auditResult} />;
      default:
        return <Overview auditResult={auditResult} onSelectCategory={openCategory} />;
    }
  };

  return (
    <AppShell
      navbar={{
        width: 260,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      header={{ height: 48 }}
      padding="lg"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} size="sm" hiddenFrom="sm" />
            <Text fw={700}>dsaudit</Text>
          </Group>
          <Text size="xs" c="dimmed">
            Design system health report
          </Text>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <Sidebar
          currentSection={currentSection}
          onSectionChange={navigate}
          auditResult={auditResult}
        />
      </AppShell.Navbar>

      <AppShell.Main>
        <Stack maw={1100} mx="auto">
          {renderSection()}
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}

export default App;
