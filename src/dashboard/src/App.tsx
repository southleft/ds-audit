import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppShell,
  Badge,
  Burger,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Sparkles, XCircle } from 'lucide-react';
import Sidebar, { type Section } from './components/Sidebar';
import Overview from './components/Overview';
import Categories from './components/Categories';
import ActionPlan from './components/ActionPlan';
import Progress from './components/Progress';
import Export from './components/Export';
import type { AuditResult } from './types';
import { useProgress } from './hooks/useProgress';
import { fetchAuditResults } from './utils/api';

/**
 * Compact activity indicator shown in the header from any view, so a running
 * audit is visible even when the user has navigated away from Live Progress.
 * Clicking it jumps to the progress view.
 */
function RunningIndicator({
  progress,
  onOpen,
}: {
  progress: ReturnType<typeof useProgress>;
  onOpen: () => void;
}) {
  if (progress.auditError) {
    return (
      <UnstyledButton onClick={onOpen}>
        <Badge color="red" variant="light" leftSection={<XCircle size={12} />}>
          Audit failed
        </Badge>
      </UnstyledButton>
    );
  }

  const aiRunning = progress.aiPhase === 'running';
  if (progress.isAuditActive || aiRunning) {
    return (
      <UnstyledButton onClick={onOpen}>
        <Badge
          color={aiRunning ? 'grape' : 'blue'}
          variant="light"
          leftSection={aiRunning ? <Sparkles size={12} /> : <Loader size={12} color="blue" />}
        >
          {aiRunning ? 'AI judge reviewing…' : `Auditing… ${progress.progress}%`}
        </Badge>
      </UnstyledButton>
    );
  }

  return (
    <Text size="xs" c="dimmed">
      Design system health report
    </Text>
  );
}

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

  // Each view is a fresh page — don't inherit the previous view's scroll offset
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentSection]);

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

  // Single SSE subscription for the whole app: the header indicator and the
  // Live Progress view both read this one connection.
  const progress = useProgress(handleAuditComplete);

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
        return (
          <Overview
            auditResult={auditResult}
            onSelectCategory={openCategory}
            onNavigate={navigate}
          />
        );
      case 'categories':
        return <Categories auditResult={auditResult} initialCategoryId={selectedCategoryId} />;
      case 'action-plan':
        return <ActionPlan auditResult={auditResult} />;
      case 'progress':
        return <Progress auditResult={auditResult} progress={progress} resultsLoading={loading} />;
      case 'export':
        return <Export auditResult={auditResult} />;
      default:
        return (
          <Overview
            auditResult={auditResult}
            onSelectCategory={openCategory}
            onNavigate={navigate}
          />
        );
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
          <RunningIndicator progress={progress} onOpen={() => navigate('progress')} />
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
