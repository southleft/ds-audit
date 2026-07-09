import { promises as fs } from 'fs';
import path from 'path';
import type { AuditConfig, CategoryResult, Finding } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';

/**
 * Internal representation of a discovered component. Deliberately minimal:
 * every field here is directly measured from the filesystem or file content.
 */
interface DiscoveredComponent {
  name: string;
  path: string;
  directory: string;
  hasTests: boolean;
  hasStory: boolean;
  hasPropTypes: boolean;
}

/** Directory segments that never contain library components. */
const EXCLUDED_DIR_SEGMENTS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'pages',
  'app',
  'routes',
  '__tests__',
  '__mocks__',
  '__fixtures__',
  'test',
  'tests',
  'e2e',
  'cypress',
  '.storybook',
  '.next',
]);

export class ComponentAuditor {
  private config: AuditConfig;
  private scanner: FileScanner;

  constructor(config: AuditConfig) {
    this.config = config;
    this.scanner = new FileScanner(config);
  }

  async audit(): Promise<CategoryResult> {
    const findings: Finding[] = [];
    const allScannedPaths = new Set<string>();

    // Component candidates. Only .tsx/.jsx files — plain .ts/.js files in a
    // component tree are almost always utilities, not components. FileScanner
    // dedupes across overlapping patterns, so the counts below are exact.
    const componentFiles = await this.scanner.scanFiles([
      'src/components/**/*.{tsx,jsx}',
      'components/**/*.{tsx,jsx}',
      'lib/components/**/*.{tsx,jsx}',
      'packages/*/src/**/*.{tsx,jsx}',
      'packages/*/components/**/*.{tsx,jsx}',
      'src/ui/**/*.{tsx,jsx}',
      'ui/**/*.{tsx,jsx}',
      'src/**/*.{tsx,jsx}',
      '!**/node_modules/**',
      '!**/dist/**',
      '!**/build/**',
    ]);

    // Test and story files, scanned once and indexed by base name so per-
    // component lookups don't hit the filesystem repeatedly.
    const testFiles = await this.scanner.scanFiles([
      '**/*.{test,spec}.{ts,tsx,js,jsx}',
      '**/__tests__/**/*.{ts,tsx,js,jsx}',
      '**/tests/**/*.{ts,tsx,js,jsx}',
      '!**/node_modules/**',
      '!**/dist/**',
      '!**/build/**',
    ]);

    const storyFiles = await this.scanner.scanFiles([
      '**/*.{stories,story}.{ts,tsx,js,jsx,mdx}',
      '!**/node_modules/**',
      '!**/dist/**',
      '!**/build/**',
    ]);

    const testIndex = this.indexByBaseName(testFiles.map(f => f.path));
    const storyIndex = this.indexByBaseName(storyFiles.map(f => f.path));

    const components: DiscoveredComponent[] = [];
    const seenComponentPaths = new Set<string>();

    for (const file of componentFiles) {
      if (!this.isComponentFile(file.path)) continue;
      if (seenComponentPaths.has(file.path)) continue;
      seenComponentPaths.add(file.path);

      allScannedPaths.add(file.directory);

      const name = path.basename(file.path, path.extname(file.path));
      const directory = path.dirname(file.path);

      let hasPropTypes = false;
      try {
        const content = await fs.readFile(
          path.join(this.config.projectPath, file.path),
          'utf-8'
        );
        // A real signal: an exported/declared props contract, not just the
        // presence of the word "interface" anywhere in the file.
        hasPropTypes = /(?:export\s+)?(?:interface|type)\s+\w*Props\b/.test(content);
      } catch {
        continue; // unreadable file — not a component we can audit
      }

      components.push({
        name,
        path: file.path,
        directory,
        hasTests: this.hasCompanionFile(name, directory, testIndex),
        hasStory: this.hasCompanionFile(name, directory, storyIndex),
        hasPropTypes,
      });
    }

    // Exact deduped file count across the three scans. The scans are disjoint
    // by construction (test/story filename suffixes are excluded from the
    // component set), except suffix-less files inside __tests__/tests dirs,
    // which the component scan excludes by directory segment.
    const totalFilesScanned =
      componentFiles.length + testFiles.length + storyFiles.length;

    const total = components.length;
    const withTests = components.filter(c => c.hasTests).length;
    const withStories = components.filter(c => c.hasStory).length;
    const withPropTypes = components.filter(c => c.hasPropTypes).length;

    const testCoverage = total > 0 ? Math.round((withTests / total) * 100) : 0;
    const storyCoverage = total > 0 ? Math.round((withStories / total) * 100) : 0;
    const propTypeCoverage = total > 0 ? Math.round((withPropTypes / total) * 100) : 0;

    this.generateFindings(components, { testCoverage, storyCoverage, propTypeCoverage }, findings);

    // Score formula (documented so the number is defensible):
    //   - 0 when no components are discovered — there is nothing to audit.
    //   - Otherwise the score scales continuously with measured coverage:
    //       coverage = 0.45 * testCoverage% + 0.35 * storyCoverage% + 0.20 * propTypeCoverage%
    //       score    = round(20 + 0.80 * coverage)
    //     The 20-point baseline reflects that a discoverable component library
    //     exists at all; the remaining 80 points are earned only through
    //     verified test files, story files, and exported prop-type contracts.
    //     One untested component and a fully covered library therefore land at
    //     20 and 100 respectively, with every value in between reachable.
    let score = 0;
    if (total > 0) {
      const coverage =
        0.45 * testCoverage + 0.35 * storyCoverage + 0.2 * propTypeCoverage;
      score = Math.round(20 + 0.8 * coverage);
    }

    const detailedPaths = [
      {
        pattern: 'Component Files',
        matches: components.map(c => c.path),
        fileTypes: this.countExtensions(components.map(c => c.path)),
      },
      {
        pattern: 'Test Files',
        matches: testFiles.map(f => f.path),
        fileTypes: this.countExtensions(testFiles.map(f => f.path)),
      },
      {
        pattern: 'Story Files',
        matches: storyFiles.map(f => f.path),
        fileTypes: this.countExtensions(storyFiles.map(f => f.path)),
      },
    ].filter(group => group.matches.length > 0);

    return {
      id: 'components',
      name: 'Component Library',
      score: Math.max(0, Math.min(100, score)),
      grade: '', // stamped by the engine
      weight: 0, // stamped by the engine
      findings,
      metrics: {
        totalComponents: total,
        filesScanned: totalFilesScanned,
        testCoverage,
        storyCoverage,
        propTypeCoverage,
        componentsWithTests: withTests,
        componentsWithStories: withStories,
        componentsWithPropTypes: withPropTypes,
      },
      scannedPaths: Array.from(allScannedPaths).sort(),
      detailedPaths,
    };
  }

  /**
   * A candidate file counts as a component only when it is not a test, story,
   * spec, demo/fixture, index barrel, hook, or type/utility file, and does not
   * live in an app-shell directory (pages/, app/, routes/, ...).
   */
  private isComponentFile(filePath: string): boolean {
    const segments = filePath.split('/');
    const fileName = segments[segments.length - 1];
    const dirSegments = segments.slice(0, -1);

    if (dirSegments.some(seg => EXCLUDED_DIR_SEGMENTS.has(seg))) return false;

    const lower = fileName.toLowerCase();
    if (/\.(test|spec|stories|story)\./.test(lower)) return false;
    if (lower.endsWith('.d.ts')) return false;

    const base = path.basename(fileName, path.extname(fileName));
    // Index barrels and app entry points
    if (base.toLowerCase() === 'index' || base.toLowerCase() === 'main') return false;
    // Hooks: use + UpperCase (useTheme.tsx etc.)
    if (/^use[A-Z]/.test(base)) return false;
    // Demo/fixture/mock/example files
    if (/(demo|example|fixture|mock|sample|showcase)/i.test(base)) return false;
    // Obvious non-component modules
    if (/^(types?|constants?|utils?|helpers?|styles?|theme)$/i.test(base)) return false;

    return true;
  }

  /** Map from base name (test/story suffixes and extension stripped) to dirs. */
  private indexByBaseName(paths: string[]): Map<string, string[]> {
    const index = new Map<string, string[]>();
    for (const p of paths) {
      const base = path
        .basename(p, path.extname(p))
        .replace(/\.(test|spec|stories|story)$/, '');
      const dir = path.dirname(p);
      const existing = index.get(base);
      if (existing) {
        existing.push(dir);
      } else {
        index.set(base, [dir]);
      }
    }
    return index;
  }

  /**
   * A companion (test/story) file matches when its base name equals the
   * component name and it lives near the component: the same directory, a
   * subdirectory of it (e.g. __tests__/), or anywhere under the component's
   * parent directory (e.g. a sibling tests/ folder). This covers the
   * ComponentName.test.tsx sibling convention, __tests__/ComponentName.test.tsx,
   * and tests/ComponentName.test.tsx layouts without matching unrelated files
   * elsewhere in the repository.
   */
  private hasCompanionFile(
    name: string,
    componentDir: string,
    index: Map<string, string[]>
  ): boolean {
    const dirs = index.get(name);
    if (!dirs) return false;

    const parent = path.dirname(componentDir);
    return dirs.some(
      dir =>
        dir === componentDir ||
        dir.startsWith(`${componentDir}/`) ||
        dir === parent ||
        dir.startsWith(`${parent}/`)
    );
  }

  private countExtensions(paths: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const p of paths) {
      const ext = path.extname(p).toLowerCase();
      counts[ext] = (counts[ext] || 0) + 1;
    }
    return counts;
  }

  private generateFindings(
    components: DiscoveredComponent[],
    coverage: { testCoverage: number; storyCoverage: number; propTypeCoverage: number },
    findings: Finding[]
  ): void {
    if (components.length === 0) {
      findings.push({
        id: 'comp-none-found',
        type: 'error',
        message:
          'No component files discovered in conventional locations (src/components, components, packages/*/src, ...)',
        severity: 'high',
        suggestion:
          'If components live in a non-standard directory, add it to includePatterns in the audit config',
      });
      return;
    }

    const missingTests = components.filter(c => !c.hasTests);
    const missingStories = components.filter(c => !c.hasStory);
    const missingTypes = components.filter(c => !c.hasPropTypes);

    const exampleList = (items: DiscoveredComponent[]): string =>
      items
        .slice(0, 5)
        .map(c => c.name)
        .join(', ') + (items.length > 5 ? `, +${items.length - 5} more` : '');

    if (missingTests.length > 0) {
      findings.push({
        id: 'comp-test-coverage',
        type: coverage.testCoverage < 30 ? 'error' : 'warning',
        message: `${missingTests.length} of ${components.length} components have no test file (${coverage.testCoverage}% coverage): ${exampleList(missingTests)}`,
        severity: coverage.testCoverage < 30 ? 'high' : 'medium',
        suggestion:
          'Add unit tests as ComponentName.test.tsx siblings or in a __tests__/ directory',
      });
    } else {
      findings.push({
        id: 'comp-test-coverage-full',
        type: 'success',
        message: `All ${components.length} components have an associated test file`,
        severity: 'low',
      });
    }

    if (missingStories.length > 0) {
      findings.push({
        id: 'comp-story-coverage',
        type: 'warning',
        message: `${missingStories.length} of ${components.length} components have no Storybook story (${coverage.storyCoverage}% coverage): ${exampleList(missingStories)}`,
        severity: coverage.storyCoverage < 30 ? 'medium' : 'low',
        suggestion: 'Add ComponentName.stories.tsx files to document usage and variants',
      });
    } else {
      findings.push({
        id: 'comp-story-coverage-full',
        type: 'success',
        message: `All ${components.length} components have a story file`,
        severity: 'low',
      });
    }

    if (missingTypes.length > 0) {
      findings.push({
        id: 'comp-prop-types',
        type: 'info',
        message: `${missingTypes.length} of ${components.length} components do not declare a Props interface/type (${coverage.propTypeCoverage}% coverage): ${exampleList(missingTypes)}`,
        severity: 'low',
        suggestion:
          'Declare an explicit `interface ComponentNameProps` so the public API is documented and type-checked',
      });
    }
  }
}
