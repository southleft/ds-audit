import { promises as fs } from 'fs';
import type { AuditConfig, CategoryResult, Finding } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';

interface PackagingSignals {
  /** Fraction (0-1) of evaluated packages that declare each field. */
  sideEffects: number;
  exportsMap: number;
  esmEntry: number;
  typesField: number;
  filesAllowlist: number;
  packagesEvaluated: number;
}

interface BuiltEntry {
  path: string;
  size: number;
  type: 'javascript' | 'css';
}

/**
 * Runtime dependencies that are known bundle-size hazards when shipped in a
 * library's `dependencies`. Each entry has a reason so the finding is
 * explainable, not a blanket judgement.
 */
const HEAVY_RUNTIME_DEPS: Record<string, string> = {
  moment: 'moment is large and not tree-shakeable; prefer dayjs or date-fns',
  lodash: 'lodash (CJS) defeats tree shaking; prefer lodash-es or per-method imports',
  jquery: 'jquery in a component library dependency forces it onto every consumer',
  'core-js': 'core-js in dependencies polyfills globally in every consuming app; let consumers own polyfills',
  '@fortawesome/fontawesome-free': 'full icon packs ship every icon; prefer per-icon imports',
};

const LARGE_ENTRY_BYTES = 300 * 1024; // single built entry worth flagging
const VERY_LARGE_ENTRY_BYTES = 1024 * 1024;

export class PerformanceAuditor {
  private config: AuditConfig;
  private scanner: FileScanner;

  constructor(config: AuditConfig) {
    this.config = config;
    this.scanner = new FileScanner(config);
  }

  async audit(): Promise<CategoryResult> {
    const findings: Finding[] = [];

    const packaging = await this.analyzePackaging();
    const heavyDeps = await this.findHeavyRuntimeDeps();
    const built = await this.analyzeBuiltOutput();

    this.generatePackagingFindings(findings, packaging);
    this.generateHeavyDepFindings(findings, heavyDeps);
    this.generateBuiltOutputFindings(findings, built);
    this.generateCssStrategyFindings(findings, built.entries);

    // Score formula for design-system LIBRARIES (documented so the number is
    // defensible). We measure how well the package is prepared for consuming
    // bundlers — not app-style metrics like code splitting.
    //
    //   packagingPts (0-70), each scaled by the fraction of evaluated
    //   (library-shaped, non-private) packages declaring the field:
    //     sideEffects declared ......... 20
    //     exports map .................. 15
    //     ESM entry (module field, type:module, or exports import cond) ... 15
    //     types/typings field .......... 10
    //     files allowlist .............. 10
    //   depsPts (0-15): 15 minus 5 per distinct heavy runtime dependency
    //     (moment, CJS lodash, jquery, core-js, full icon packs), floor 0.
    //   sizePts (0-15), only when built output exists: 15 minus 5 per JS
    //     entry >300KB, minus another 5 if any entry >1MB, floor 0.
    //
    //   With built output:    score = packagingPts + depsPts + sizePts
    //   Without built output: score = round((packagingPts + depsPts) / 85 * 100)
    //     and an 'info' finding states that size checks need a build.
    const packagingPts =
      packaging.packagesEvaluated === 0
        ? 0
        : Math.round(
            20 * packaging.sideEffects +
              15 * packaging.exportsMap +
              15 * packaging.esmEntry +
              10 * packaging.typesField +
              10 * packaging.filesAllowlist
          );
    const depsPts = Math.max(0, 15 - heavyDeps.length * 5);

    let sizePts = 0;
    let score: number;
    if (built.hasBuildOutput) {
      const largeEntries = built.entries.filter(
        e => e.type === 'javascript' && e.size > LARGE_ENTRY_BYTES
      );
      const hasVeryLarge = built.entries.some(
        e => e.type === 'javascript' && e.size > VERY_LARGE_ENTRY_BYTES
      );
      sizePts = Math.max(0, 15 - largeEntries.length * 5 - (hasVeryLarge ? 5 : 0));
      score = packagingPts + depsPts + sizePts;
    } else {
      score = Math.round(((packagingPts + depsPts) / 85) * 100);
      findings.push({
        id: 'perf-no-build-output',
        type: 'info',
        message:
          'Insufficient signal for size analysis — no dist/build/lib output found. Build the package to enable per-entry size checks.',
        severity: 'low',
        suggestion: 'Run the build and re-audit to include built entry sizes in the score',
      });
    }

    const hasAnyPackagingSignal =
      packaging.packagesEvaluated > 0 &&
      (packaging.sideEffects > 0 ||
        packaging.exportsMap > 0 ||
        packaging.esmEntry > 0 ||
        packaging.typesField > 0 ||
        packaging.filesAllowlist > 0);

    if (!built.hasBuildOutput && !hasAnyPackagingSignal) {
      findings.push({
        id: 'perf-insufficient-signal',
        type: 'info',
        message:
          'Neither built output nor library packaging fields (sideEffects, exports, module, types, files) were found — the performance score reflects packaging fields only and is necessarily low',
        severity: 'low',
      });
    }

    return {
      id: 'performance',
      name: 'Performance',
      score: Math.max(0, Math.min(100, score)),
      grade: '', // stamped by the engine
      weight: 0, // stamped by the engine
      findings,
      metrics: {
        filesScanned: built.entries.length,
        hasBuildOutput: built.hasBuildOutput,
        packaging: {
          sideEffects: packaging.sideEffects,
          exportsMap: packaging.exportsMap,
          esmEntry: packaging.esmEntry,
          typesField: packaging.typesField,
          filesAllowlist: packaging.filesAllowlist,
          packagesEvaluated: packaging.packagesEvaluated,
        },
        largestEntries: built.entries
          .slice()
          .sort((a, b) => b.size - a.size)
          .slice(0, 5)
          .map(e => ({ path: e.path, sizeKB: Math.round(e.size / 1024) })),
        heavyDependencies: heavyDeps,
        scoreBreakdown: {
          packaging: packagingPts,
          dependencies: depsPts,
          buildOutput: built.hasBuildOutput ? sizePts : null,
        },
      },
    };
  }

  /**
   * Evaluate packaging fields on every library-shaped, non-private
   * package.json (root and workspaces). "Library-shaped" means it declares an
   * entry point (main/module/exports). If none qualify, fall back to the root
   * package.json so single-package repos are still evaluated.
   */
  private async analyzePackaging(): Promise<PackagingSignals> {
    const packageFiles = await this.scanner.scanFiles([
      '**/package.json',
      '!**/node_modules/**',
      '!**/dist/**',
      '!**/build/**',
    ]);

    const packages: any[] = [];
    for (const file of packageFiles) {
      try {
        packages.push(JSON.parse(await this.scanner.readFile(file.path)));
      } catch {
        // Unparseable — skip
      }
    }

    let candidates = packages.filter(
      pkg => !pkg.private && (pkg.main || pkg.module || pkg.exports)
    );
    if (candidates.length === 0) {
      const root = packages.find(pkg => pkg.name);
      candidates = root ? [root] : [];
    }

    const frac = (predicate: (pkg: any) => boolean): number =>
      candidates.length === 0
        ? 0
        : candidates.filter(predicate).length / candidates.length;

    return {
      sideEffects: frac(pkg => pkg.sideEffects !== undefined),
      exportsMap: frac(pkg => pkg.exports !== undefined),
      esmEntry: frac(
        pkg =>
          pkg.module !== undefined ||
          pkg.type === 'module' ||
          this.exportsHasImportCondition(pkg.exports)
      ),
      typesField: frac(
        pkg =>
          pkg.types !== undefined ||
          pkg.typings !== undefined ||
          this.exportsHasTypesCondition(pkg.exports)
      ),
      filesAllowlist: frac(pkg => Array.isArray(pkg.files) && pkg.files.length > 0),
      packagesEvaluated: candidates.length,
    };
  }

  private exportsHasImportCondition(exportsField: unknown): boolean {
    if (!exportsField || typeof exportsField !== 'object') return false;
    return JSON.stringify(exportsField).includes('"import"');
  }

  private exportsHasTypesCondition(exportsField: unknown): boolean {
    if (!exportsField || typeof exportsField !== 'object') return false;
    return JSON.stringify(exportsField).includes('"types"');
  }

  /** Heavy deps only count when in `dependencies` — devDependencies are fine. */
  private async findHeavyRuntimeDeps(): Promise<string[]> {
    const packageFiles = await this.scanner.scanFiles([
      '**/package.json',
      '!**/node_modules/**',
    ]);

    const heavy = new Set<string>();
    for (const file of packageFiles) {
      try {
        const pkg = JSON.parse(await this.scanner.readFile(file.path));
        const deps = pkg.dependencies || {};
        for (const dep of Object.keys(HEAVY_RUNTIME_DEPS)) {
          if (deps[dep]) {
            // lodash is only a hazard when lodash-es isn't the actual import path
            if (dep === 'lodash' && deps['lodash-es']) continue;
            heavy.add(dep);
          }
        }
      } catch {
        // skip
      }
    }
    return Array.from(heavy);
  }

  /** Measure real built entry sizes; never estimate or fabricate. */
  private async analyzeBuiltOutput(): Promise<{
    hasBuildOutput: boolean;
    entries: BuiltEntry[];
  }> {
    const entries: BuiltEntry[] = [];
    let hasBuildOutput = false;

    for (const dir of ['dist', 'build', 'lib']) {
      if (!(await this.scanner.fileExists(dir))) continue;

      const files = await this.scanner.scanFiles([`${dir}/**/*.{js,mjs,cjs,css}`]);
      if (files.length > 0) hasBuildOutput = true;

      for (const file of files) {
        // Skip sourcemap-adjacent noise; measure the shipped artifact itself.
        try {
          const stats = await fs.stat(file.absolutePath);
          entries.push({
            path: file.path,
            size: stats.size,
            type: file.extension === '.css' ? 'css' : 'javascript',
          });
        } catch {
          // stat failed — skip
        }
      }
    }

    return { hasBuildOutput, entries };
  }

  private generatePackagingFindings(findings: Finding[], packaging: PackagingSignals): void {
    if (packaging.packagesEvaluated === 0) {
      findings.push({
        id: 'perf-no-package-json',
        type: 'warning',
        message: 'No package.json found to evaluate library packaging',
        severity: 'medium',
      });
      return;
    }

    const checks: Array<{ key: keyof PackagingSignals; label: string; suggestion: string }> = [
      {
        key: 'sideEffects',
        label: 'sideEffects declaration',
        suggestion:
          'Declare "sideEffects": false (or an array of side-effectful files, e.g. CSS) so consumers\' bundlers can tree-shake',
      },
      {
        key: 'exportsMap',
        label: 'exports map',
        suggestion:
          'Add an "exports" map so entry points are explicit and deep-import surface is controlled',
      },
      {
        key: 'esmEntry',
        label: 'ESM entry point',
        suggestion:
          'Ship ESM via a "module" field, "type": "module", or an "import" condition in exports — required for tree shaking',
      },
      {
        key: 'typesField',
        label: 'TypeScript types field',
        suggestion: 'Add a "types" field (or types conditions in exports) so consumers get typings',
      },
      {
        key: 'filesAllowlist',
        label: 'files allowlist',
        suggestion:
          'Add a "files" array so the published tarball contains only built artifacts',
      },
    ];

    const present = checks.filter(c => (packaging[c.key] as number) >= 1);
    const missing = checks.filter(c => (packaging[c.key] as number) === 0);
    const partial = checks.filter(c => {
      const v = packaging[c.key] as number;
      return v > 0 && v < 1;
    });

    if (present.length > 0) {
      findings.push({
        id: 'perf-packaging-present',
        type: 'success',
        message: `Library packaging fields present: ${present.map(c => c.label).join(', ')}`,
        severity: 'low',
      });
    }

    for (const check of missing) {
      findings.push({
        id: `perf-missing-${check.key}`,
        type: 'warning',
        message: `Missing ${check.label} in package.json`,
        severity: check.key === 'sideEffects' || check.key === 'esmEntry' ? 'medium' : 'low',
        suggestion: check.suggestion,
      });
    }

    for (const check of partial) {
      const pct = Math.round((packaging[check.key] as number) * 100);
      findings.push({
        id: `perf-partial-${check.key}`,
        type: 'warning',
        message: `Only ${pct}% of publishable packages declare a ${check.label}`,
        severity: 'low',
        suggestion: check.suggestion,
      });
    }
  }

  private generateHeavyDepFindings(findings: Finding[], heavyDeps: string[]): void {
    for (const dep of heavyDeps) {
      findings.push({
        id: `perf-heavy-dep-${dep}`,
        type: 'warning',
        message: `Heavy runtime dependency: ${dep} — ${HEAVY_RUNTIME_DEPS[dep]}`,
        severity: 'medium',
        suggestion: HEAVY_RUNTIME_DEPS[dep],
      });
    }
  }

  private generateBuiltOutputFindings(
    findings: Finding[],
    built: { hasBuildOutput: boolean; entries: BuiltEntry[] }
  ): void {
    if (!built.hasBuildOutput) return;

    const jsEntries = built.entries
      .filter(e => e.type === 'javascript')
      .sort((a, b) => b.size - a.size);

    const large = jsEntries.filter(e => e.size > LARGE_ENTRY_BYTES);
    for (const entry of large.slice(0, 5)) {
      findings.push({
        id: `perf-large-entry-${entry.path}`,
        type: 'warning',
        message: `Large built entry: ${entry.path} (${Math.round(entry.size / 1024)}KB)`,
        severity: entry.size > VERY_LARGE_ENTRY_BYTES ? 'high' : 'medium',
        path: entry.path,
        suggestion:
          'Verify this entry only contains what its import path promises; large single entries defeat per-component consumption',
      });
    }

    if (jsEntries.length > 0 && large.length === 0) {
      findings.push({
        id: 'perf-entry-sizes-ok',
        type: 'success',
        message: `Largest built JS entry is ${Math.round(jsEntries[0].size / 1024)}KB — no oversized entries`,
        severity: 'low',
      });
    }
  }

  /** CSS delivery strategy is reported as signal, not scored. */
  private generateCssStrategyFindings(findings: Finding[], entries: BuiltEntry[]): void {
    const cssEntries = entries.filter(e => e.type === 'css');
    if (cssEntries.length === 0) return;

    if (cssEntries.length === 1 && cssEntries[0].size > 20 * 1024) {
      findings.push({
        id: 'perf-monolithic-css',
        type: 'info',
        message: `CSS ships as a single ${Math.round(cssEntries[0].size / 1024)}KB stylesheet (${cssEntries[0].path}) — consumers cannot load styles per component`,
        severity: 'low',
        path: cssEntries[0].path,
        suggestion:
          'Consider emitting per-component CSS (or CSS extractable per entry) so consumers only ship the styles they use',
      });
    } else if (cssEntries.length > 1) {
      findings.push({
        id: 'perf-css-per-entry',
        type: 'success',
        message: `CSS ships as ${cssEntries.length} files — per-component/extractable strategy`,
        severity: 'low',
      });
    }
  }
}
