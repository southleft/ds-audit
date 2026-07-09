import type { AuditConfig, CategoryResult, Finding } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';

interface StaticViolation {
  rule: 'img-missing-alt' | 'positive-tabindex' | 'clickable-non-interactive';
  message: string;
  path: string;
  line: number;
  suggestion: string;
}

/** Dependencies that indicate real accessibility tooling adoption. */
const A11Y_LINT_PLUGINS = ['eslint-plugin-jsx-a11y'];
const A11Y_RUNTIME_TOOLS = [
  'jest-axe',
  'axe-core',
  'cypress-axe',
  'pa11y',
  'vitest-axe',
];
const A11Y_STORYBOOK_ADDONS = ['@storybook/addon-a11y'];

/** Cap on per-violation findings so a large repo doesn't flood the report. */
const MAX_VIOLATION_FINDINGS = 40;

export class AccessibilityAuditor {
  private config: AuditConfig;
  private scanner: FileScanner;

  constructor(config: AuditConfig) {
    this.config = config;
    this.scanner = new FileScanner(config);
  }

  async audit(): Promise<CategoryResult> {
    const findings: Finding[] = [];

    // 1. Tooling adoption (primary signal) — deps aggregated across every
    //    package.json in the repo, so monorepos are covered.
    const deps = await this.collectDependencies();
    const lintPlugins = A11Y_LINT_PLUGINS.filter(t => deps.has(t));
    const runtimeTools = A11Y_RUNTIME_TOOLS.filter(t => deps.has(t)).concat(
      Array.from(deps).filter(d => d.startsWith('@axe-core/'))
    );
    const storybookAddons = A11Y_STORYBOOK_ADDONS.filter(t => deps.has(t));
    const detectedTools = [...lintPlugins, ...runtimeTools, ...storybookAddons];

    // 2. Is jsx-a11y actually enabled in an eslint config (not just installed)?
    const eslintJsxA11yEnabled = await this.checkEslintJsxA11y();

    // 3. Context-free static JSX checks with file+line evidence.
    const { violations, autoFocusCount, filesScanned } = await this.scanStaticViolations();

    this.generateToolingFindings(
      findings,
      lintPlugins,
      runtimeTools,
      storybookAddons,
      eslintJsxA11yEnabled
    );
    this.generateViolationFindings(findings, violations, autoFocusCount);

    // Honest disclosure: this is static analysis, not WCAG verification.
    findings.push({
      id: 'a11y-scope-disclosure',
      type: 'info',
      message:
        'Accessibility score reflects tooling adoption and static JSX checks only. ' +
        'Full WCAG compliance requires runtime testing (axe on rendered output, keyboard ' +
        'and screen-reader review, contrast measurement) that this tool does not perform.',
      severity: 'low',
    });

    // Score formula (documented so the number is defensible):
    //   toolingScore (0-100): lint plugin installed = 30, runtime axe-style
    //     testing (jest-axe/axe-core/@axe-core/*/cypress-axe/pa11y) = 45,
    //     Storybook a11y addon = 25.
    //   lintScore (0-100): 100 when an eslint config actually enables
    //     jsx-a11y; 0 otherwise (installation alone scores under tooling).
    //   violationScore (0-100): 100 - 250 * (violations / files scanned),
    //     floored at 0 — i.e. 0.4 static violations per component file zeroes
    //     this axis. 100 when no component files exist to scan.
    //   score = round(0.50 * toolingScore + 0.20 * lintScore + 0.30 * violationScore)
    const toolingScore =
      (lintPlugins.length > 0 ? 30 : 0) +
      (runtimeTools.length > 0 ? 45 : 0) +
      (storybookAddons.length > 0 ? 25 : 0);
    const lintScore = eslintJsxA11yEnabled ? 100 : 0;
    const violationScore =
      filesScanned === 0
        ? 100
        : Math.max(0, Math.round(100 - 250 * (violations.length / filesScanned)));

    const score = Math.round(
      0.5 * toolingScore + 0.2 * lintScore + 0.3 * violationScore
    );

    return {
      id: 'accessibility',
      name: 'Accessibility',
      score: Math.max(0, Math.min(100, score)),
      grade: '', // stamped by the engine
      weight: 0, // stamped by the engine
      findings,
      metrics: {
        filesScanned,
        toolsDetected: detectedTools,
        eslintJsxA11yEnabled,
        staticViolationCount: violations.length,
        staticViolationsByRule: {
          imgMissingAlt: violations.filter(v => v.rule === 'img-missing-alt').length,
          positiveTabIndex: violations.filter(v => v.rule === 'positive-tabindex').length,
          clickableNonInteractive: violations.filter(
            v => v.rule === 'clickable-non-interactive'
          ).length,
        },
        autoFocusCount,
        scoreBreakdown: {
          tooling: toolingScore,
          lintEnforcement: lintScore,
          staticViolations: violationScore,
        },
      },
    };
  }

  /** Aggregate dependencies + devDependencies across all package.json files. */
  private async collectDependencies(): Promise<Set<string>> {
    const deps = new Set<string>();
    const packageFiles = await this.scanner.scanFiles([
      '**/package.json',
      '!**/node_modules/**',
      '!**/dist/**',
      '!**/build/**',
    ]);

    for (const file of packageFiles) {
      try {
        const pkg = JSON.parse(await this.scanner.readFile(file.path));
        for (const key of Object.keys({
          ...pkg.dependencies,
          ...pkg.devDependencies,
        })) {
          deps.add(key);
        }
      } catch {
        // Unparseable package.json — skip
      }
    }
    return deps;
  }

  /** True when any eslint config file references the jsx-a11y plugin. */
  private async checkEslintJsxA11y(): Promise<boolean> {
    const configFiles = await this.scanner.scanFiles([
      '**/.eslintrc',
      '**/.eslintrc.{js,cjs,mjs,json,yaml,yml}',
      '**/eslint.config.{js,cjs,mjs,ts,mts,cts}',
      '!**/node_modules/**',
    ]);

    for (const file of configFiles) {
      try {
        const content = await this.scanner.readFile(file.path);
        if (content.includes('jsx-a11y')) return true;
      } catch {
        // unreadable config — skip
      }
    }

    // eslintConfig embedded in package.json
    const packageFiles = await this.scanner.scanFiles([
      '**/package.json',
      '!**/node_modules/**',
    ]);
    for (const file of packageFiles) {
      try {
        const pkg = JSON.parse(await this.scanner.readFile(file.path));
        if (pkg.eslintConfig && JSON.stringify(pkg.eslintConfig).includes('jsx-a11y')) {
          return true;
        }
      } catch {
        // skip
      }
    }
    return false;
  }

  /**
   * Static JSX checks that are valid without runtime context:
   *   - <img> without an alt attribute
   *   - positive tabIndex values (tabIndex={1} and up break tab order)
   *   - onClick on div/span without role or tabIndex (mouse-only interaction)
   *   - autoFocus prevalence (reported, not scored — occasionally legitimate)
   * Test and story files are excluded so fixtures don't count as violations.
   */
  private async scanStaticViolations(): Promise<{
    violations: StaticViolation[];
    autoFocusCount: number;
    filesScanned: number;
  }> {
    const files = await this.scanner.scanFiles([
      '**/*.{tsx,jsx}',
      '!**/node_modules/**',
      '!**/dist/**',
      '!**/build/**',
      '!**/*.test.*',
      '!**/*.spec.*',
      '!**/*.stories.*',
      '!**/*.story.*',
    ]);

    const violations: StaticViolation[] = [];
    let autoFocusCount = 0;

    for (const file of files) {
      let content: string;
      try {
        content = await this.scanner.readFile(file.path);
      } catch {
        continue;
      }

      // <img ...> without alt=
      for (const match of content.matchAll(/<img\b[^>]*?\/?>/gs)) {
        if (!/\balt\s*=/.test(match[0])) {
          violations.push({
            rule: 'img-missing-alt',
            message: `<img> without alt attribute`,
            path: file.path,
            line: this.lineOf(content, match.index ?? 0),
            suggestion:
              'Add alt text (or alt="" for purely decorative images) so screen readers can handle the image',
          });
        }
      }

      // Positive tabIndex: tabIndex={1}, tabIndex="2", tabindex="3"
      for (const match of content.matchAll(
        /\btab[iI]ndex\s*=\s*(?:\{\s*)?["']?([0-9]+)/g
      )) {
        if (parseInt(match[1], 10) >= 1) {
          violations.push({
            rule: 'positive-tabindex',
            message: `Positive tabIndex (${match[1]}) disrupts natural tab order`,
            path: file.path,
            line: this.lineOf(content, match.index ?? 0),
            suggestion: 'Use tabIndex={0} (focusable in order) or tabIndex={-1} (programmatic focus) instead',
          });
        }
      }

      // onClick on div/span without role or tabIndex
      for (const match of content.matchAll(/<(div|span)\b[^>]*?onClick[^>]*?>/gs)) {
        const tag = match[0];
        if (!/\brole\s*=/.test(tag) && !/\btabIndex\s*=/.test(tag)) {
          violations.push({
            rule: 'clickable-non-interactive',
            message: `<${match[1]}> with onClick but no role or tabIndex (keyboard users cannot activate it)`,
            path: file.path,
            line: this.lineOf(content, match.index ?? 0),
            suggestion:
              'Use a <button>, or add role="button", tabIndex={0}, and a keyboard handler',
          });
        }
      }

      autoFocusCount += (content.match(/\bautoFocus\b/g) || []).length;
    }

    return { violations, autoFocusCount, filesScanned: files.length };
  }

  private lineOf(content: string, index: number): number {
    let line = 1;
    for (let i = 0; i < index && i < content.length; i++) {
      if (content[i] === '\n') line++;
    }
    return line;
  }

  private generateToolingFindings(
    findings: Finding[],
    lintPlugins: string[],
    runtimeTools: string[],
    storybookAddons: string[],
    eslintJsxA11yEnabled: boolean
  ): void {
    const allTools = [...lintPlugins, ...runtimeTools, ...storybookAddons];

    if (allTools.length > 0) {
      findings.push({
        id: 'a11y-tooling-present',
        type: 'success',
        message: `Accessibility tooling detected: ${allTools.join(', ')}`,
        severity: 'low',
      });
    } else {
      findings.push({
        id: 'a11y-no-tooling',
        type: 'error',
        message:
          'No accessibility tooling detected (eslint-plugin-jsx-a11y, jest-axe, axe-core, @storybook/addon-a11y, pa11y, cypress-axe)',
        severity: 'high',
        suggestion:
          'Add eslint-plugin-jsx-a11y for static enforcement and jest-axe (or axe in Storybook/Cypress) for rendered-output checks',
      });
    }

    if (runtimeTools.length === 0 && allTools.length > 0) {
      findings.push({
        id: 'a11y-no-runtime-testing',
        type: 'warning',
        message:
          'No axe-based runtime accessibility testing detected (jest-axe, axe-core, cypress-axe, pa11y)',
        severity: 'medium',
        suggestion: 'Add jest-axe or axe-core assertions so rendered components are verified',
      });
    }

    if (lintPlugins.length > 0 && !eslintJsxA11yEnabled) {
      findings.push({
        id: 'a11y-lint-not-enabled',
        type: 'warning',
        message:
          'eslint-plugin-jsx-a11y is installed but no eslint config appears to enable it',
        severity: 'medium',
        suggestion:
          'Extend plugin:jsx-a11y/recommended (or add the plugin to your flat config) so the rules actually run',
      });
    } else if (eslintJsxA11yEnabled) {
      findings.push({
        id: 'a11y-lint-enabled',
        type: 'success',
        message: 'jsx-a11y lint rules are enabled in the eslint configuration',
        severity: 'low',
      });
    }
  }

  private generateViolationFindings(
    findings: Finding[],
    violations: StaticViolation[],
    autoFocusCount: number
  ): void {
    for (const violation of violations.slice(0, MAX_VIOLATION_FINDINGS)) {
      findings.push({
        id: `a11y-${violation.rule}-${violation.path}-${violation.line}`,
        type: 'warning',
        message: violation.message,
        severity: 'medium',
        path: violation.path,
        line: violation.line,
        suggestion: violation.suggestion,
      });
    }

    if (violations.length > MAX_VIOLATION_FINDINGS) {
      findings.push({
        id: 'a11y-violations-truncated',
        type: 'info',
        message: `${violations.length - MAX_VIOLATION_FINDINGS} additional static violations not listed individually (${violations.length} total)`,
        severity: 'low',
      });
    }

    if (violations.length === 0) {
      findings.push({
        id: 'a11y-no-static-violations',
        type: 'success',
        message:
          'No static JSX violations found (img alt, positive tabIndex, mouse-only click handlers)',
        severity: 'low',
      });
    }

    if (autoFocusCount >= 3) {
      findings.push({
        id: 'a11y-autofocus-prevalence',
        type: 'info',
        message: `autoFocus used ${autoFocusCount} times — frequent autofocus can disorient screen-reader and keyboard users`,
        severity: 'low',
        suggestion: 'Reserve autoFocus for genuinely modal flows; avoid it in reusable components',
      });
    }
  }
}
