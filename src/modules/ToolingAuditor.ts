import type { AuditConfig, CategoryResult, Finding } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';

interface ToolingScores {
  buildTools: number;
  frameworkRuntime: number;
  testingSetup: number;
  ciDxExperience: number;
}

/**
 * Point ceilings. Each category is worth exactly 25 and every point is
 * attainable, so a flawless repository reaches 100:
 *   Build (25):     bundler 12 (webpack 10) + CSS tooling 3 + transpiler 3 + ESM 4 + lockfile 3
 *   Framework (25): modern framework 8 + TypeScript 7 + peerDependencies 6 + version currency 4
 *   Testing (25):   unit framework 10 + Testing Library 3 + E2E 5 + Storybook 5 + coverage 2
 *   CI/DX (25):     CI 6 + ESLint 4 + Prettier 3 + README 3 + doc generation 2
 *                   + husky 3 + commitlint 2 + lint-staged 1 + editorconfig 1
 */
export class ToolingAuditor {
  private config: AuditConfig;
  private scanner: FileScanner;

  constructor(config: AuditConfig) {
    this.config = config;
    this.scanner = new FileScanner(config);
  }

  async audit(): Promise<CategoryResult> {
    const findings: Finding[] = [];
    const toolsDetected: string[] = [];

    const projectInfo = await this.scanner.detectProjectInfo();
    const configFiles = await this.scanner.findConfigFiles();
    const packageInfo = await this.detectToolsFromPackageJson();

    const scores: ToolingScores = {
      buildTools: 0,
      frameworkRuntime: 0,
      testingSetup: 0,
      ciDxExperience: 0,
    };

    const buildToolsResult = await this.evaluateBuildTools(configFiles, packageInfo);
    scores.buildTools = buildToolsResult.score;
    findings.push(...buildToolsResult.findings);
    toolsDetected.push(...buildToolsResult.tools);

    const frameworkResult = this.evaluateFrameworkRuntime(projectInfo, packageInfo, configFiles);
    scores.frameworkRuntime = frameworkResult.score;
    findings.push(...frameworkResult.findings);
    toolsDetected.push(...frameworkResult.tools);

    const testingResult = this.evaluateTestingSetup(configFiles, packageInfo, projectInfo);
    scores.testingSetup = testingResult.score;
    findings.push(...testingResult.findings);
    toolsDetected.push(...testingResult.tools);

    const ciDxResult = await this.evaluateCiDxExperience(configFiles, packageInfo);
    scores.ciDxExperience = ciDxResult.score;
    findings.push(...ciDxResult.findings);
    toolsDetected.push(...ciDxResult.tools);

    const totalScore = Math.round(
      scores.buildTools + scores.frameworkRuntime + scores.testingSetup + scores.ciDxExperience
    );

    findings.unshift({
      id: 'tooling-breakdown',
      type: 'info',
      message: `Scoring: Build Tools (${scores.buildTools}/25), Framework (${scores.frameworkRuntime}/25), Testing (${scores.testingSetup}/25), CI/DX (${scores.ciDxExperience}/25)`,
      severity: 'low',
    });

    return {
      id: 'tooling',
      name: 'Tooling & Infrastructure',
      score: Math.max(0, Math.min(100, totalScore)),
      grade: '', // stamped by the engine
      weight: 0, // stamped by the engine
      findings,
      metrics: {
        filesScanned: Object.values(configFiles).flat().length,
        toolsDetected,
        framework: projectInfo.type,
        hasTypeScript: projectInfo.hasTypeScript,
        hasStorybook: projectInfo.hasStorybook,
        hasTests: projectInfo.hasTests,
        scoreBreakdown: scores,
      },
    };
  }

  /** Build (25): bundler 12 + CSS tooling 3 + transpiler 3 + ESM 4 + lockfile 3 */
  private async evaluateBuildTools(configFiles: any, packageInfo: any): Promise<any> {
    const score = { value: 0 };
    const findings: Finding[] = [];
    const tools: string[] = [];

    // Bundler (12 pts; webpack 10 — heavier config surface for library output)
    if (configFiles.vite?.length > 0 || packageInfo.hasVite) {
      score.value += 12;
      tools.push('Vite');
      findings.push({
        id: 'build-vite',
        type: 'success',
        message: 'Vite detected - modern, fast build tool',
        severity: 'low',
      });
    } else if (packageInfo.hasRollup) {
      score.value += 12;
      tools.push('Rollup');
      findings.push({
        id: 'build-rollup',
        type: 'success',
        message: 'Rollup detected - well suited to library bundling',
        severity: 'low',
      });
    } else if (packageInfo.hasTsup) {
      score.value += 12;
      tools.push('tsup');
      findings.push({
        id: 'build-tsup',
        type: 'success',
        message: 'tsup detected - zero-config library bundler',
        severity: 'low',
      });
    } else if (packageInfo.hasEsbuild) {
      score.value += 12;
      tools.push('esbuild');
      findings.push({
        id: 'build-esbuild',
        type: 'success',
        message: 'esbuild detected - ultra-fast bundler',
        severity: 'low',
      });
    } else if (configFiles.webpack?.length > 0 || packageInfo.hasWebpack) {
      score.value += 10;
      tools.push('Webpack');
      findings.push({
        id: 'build-webpack',
        type: 'success',
        message: 'Webpack detected - robust bundler',
        severity: 'low',
      });
    }

    // Legacy task runners (penalty)
    if (packageInfo.hasGulp || packageInfo.hasGrunt) {
      score.value = Math.max(0, score.value - 10);
      findings.push({
        id: 'build-legacy',
        type: 'warning',
        message: 'Legacy build tools detected (Gulp/Grunt)',
        severity: 'medium',
        suggestion: 'Consider migrating to modern build tools like Vite, Rollup, or tsup',
      });
    }

    // CSS tooling (3 pts)
    if (packageInfo.hasPostCSS || packageInfo.hasSass) {
      score.value += 3;
      tools.push(packageInfo.hasPostCSS ? 'PostCSS' : 'Sass');
    }

    // Transpiler (3 pts) — SWC/Babel, or TypeScript acting as the compiler
    if (packageInfo.hasSWC || packageInfo.hasBabel || configFiles.babel?.length > 0) {
      score.value += 3;
      tools.push(packageInfo.hasSWC ? 'SWC' : 'Babel');
    } else if (packageInfo.hasTypeScript) {
      score.value += 3;
    }

    // ESM (4 pts)
    if (packageInfo.type === 'module') {
      score.value += 4;
      findings.push({
        id: 'build-esm',
        type: 'success',
        message: 'ESM modules configured ("type": "module")',
        severity: 'low',
      });
    }

    // Lockfile / package manager (3 pts)
    if (await this.scanner.fileExists('pnpm-lock.yaml')) {
      score.value += 3;
      tools.push('pnpm');
    } else if (await this.scanner.fileExists('yarn.lock')) {
      score.value += 2;
      tools.push('Yarn');
    } else if (await this.scanner.fileExists('package-lock.json')) {
      score.value += 2;
      tools.push('npm');
    }

    if (score.value < 25) {
      const missing: string[] = [];
      if (
        !packageInfo.hasVite &&
        !packageInfo.hasWebpack &&
        !packageInfo.hasRollup &&
        !packageInfo.hasEsbuild &&
        !packageInfo.hasTsup
      ) {
        missing.push('modern bundler (Vite, Rollup, tsup, or esbuild) (+12 pts)');
      }
      if (!packageInfo.hasPostCSS && !packageInfo.hasSass) {
        missing.push('CSS processing (PostCSS or Sass) (+3 pts)');
      }
      if (packageInfo.type !== 'module') {
        missing.push('ESM ("type": "module" in package.json) (+4 pts)');
      }
      if (missing.length > 0) {
        findings.push({
          id: 'build-improvements',
          type: 'warning',
          message: `Build Tools: Missing ${missing.join(', ')}`,
          severity: 'medium',
          suggestion: `Add these tools to improve your build setup (currently ${score.value}/25)`,
        });
      }
    }

    return { score: Math.min(25, score.value), findings, tools };
  }

  /**
   * Framework (25) — scored for a LIBRARY, not an application:
   *   modern framework present (8), TypeScript (7),
   *   framework declared in peerDependencies (6), framework version currency (4).
   * App frameworks (Next.js/Remix) and state management are irrelevant to a
   * component library and are not expected.
   */
  private evaluateFrameworkRuntime(projectInfo: any, packageInfo: any, configFiles?: any): any {
    const score = { value: 0 };
    const findings: Finding[] = [];
    const tools: string[] = [];

    const frameworkName = packageInfo.framework as string | undefined;

    // Modern framework (8 pts)
    if (frameworkName) {
      score.value += 8;
      tools.push(frameworkName);
      findings.push({
        id: 'framework-detected',
        type: 'success',
        message: `${frameworkName} detected as the component framework`,
        severity: 'low',
      });
    }

    // TypeScript (7 pts)
    if (projectInfo.hasTypeScript || configFiles?.typescript?.length > 0) {
      score.value += 7;
      tools.push('TypeScript');
      findings.push({
        id: 'runtime-typescript',
        type: 'success',
        message: 'TypeScript detected - type safety enabled',
        severity: 'low',
      });
    }

    // peerDependencies correctness (6 pts): a library must not bundle its
    // framework; consumers provide it. Real check against peerDependencies.
    if (frameworkName) {
      if (packageInfo.frameworkInPeerDeps) {
        score.value += 6;
        findings.push({
          id: 'framework-peerdeps',
          type: 'success',
          message: `${frameworkName} is declared in peerDependencies — consumers control the framework version`,
          severity: 'low',
        });
      } else {
        findings.push({
          id: 'framework-not-peerdep',
          type: 'warning',
          message: `${frameworkName} is not declared in peerDependencies of any package — a library should not bundle its framework`,
          severity: 'medium',
          suggestion: `Move ${frameworkName.toLowerCase()} to peerDependencies (and devDependencies for local development)`,
        });
      }
    }

    // Framework version currency (4 pts)
    if (frameworkName && packageInfo.frameworkMajor !== undefined) {
      const currentMajors: Record<string, number> = {
        React: 18,
        Vue: 3,
        Svelte: 4,
        Angular: 15,
        Lit: 2,
      };
      const minCurrent = currentMajors[frameworkName];
      if (minCurrent !== undefined && packageInfo.frameworkMajor >= minCurrent) {
        score.value += 4;
      } else if (minCurrent !== undefined) {
        findings.push({
          id: 'framework-outdated',
          type: 'warning',
          message: `${frameworkName} v${packageInfo.frameworkMajor} is behind the current major (v${minCurrent}+)`,
          severity: 'medium',
          suggestion: `Plan an upgrade so consumers on current ${frameworkName} versions are supported`,
        });
      }
    }

    // jQuery as the primary approach (penalty)
    if (packageInfo.hasJQuery && !frameworkName) {
      score.value = Math.max(0, score.value - 10);
      findings.push({
        id: 'framework-jquery',
        type: 'error',
        message: 'jQuery detected as primary framework',
        severity: 'high',
        suggestion: 'Consider migrating to a modern component-based framework',
      });
    }

    if (score.value < 25) {
      const missing: string[] = [];
      if (!frameworkName) {
        missing.push('modern component framework (React, Vue, Svelte, Lit, or Angular) (+8 pts)');
      }
      if (!projectInfo.hasTypeScript && !(configFiles?.typescript?.length > 0)) {
        missing.push('TypeScript for type safety (+7 pts)');
      }
      if (frameworkName && !packageInfo.frameworkInPeerDeps) {
        missing.push('framework in peerDependencies (+6 pts)');
      }
      if (missing.length > 0) {
        findings.push({
          id: 'framework-improvements',
          type: 'warning',
          message: `Framework & Runtime: Consider ${missing.join(', ')}`,
          severity: 'medium',
          suggestion: `These changes would improve your score (currently ${score.value}/25)`,
        });
      }
    }

    return { score: Math.min(25, score.value), findings, tools };
  }

  /** Testing (25): unit 10 + Testing Library 3 + E2E 5 + Storybook 5 + coverage 2 */
  private evaluateTestingSetup(configFiles: any, packageInfo: any, projectInfo: any): any {
    const score = { value: 0 };
    const findings: Finding[] = [];
    const tools: string[] = [];

    if (configFiles.jest?.length > 0 || packageInfo.hasJest) {
      score.value += 10;
      tools.push('Jest');
      findings.push({
        id: 'test-jest',
        type: 'success',
        message: 'Jest testing framework detected',
        severity: 'low',
      });
    } else if (packageInfo.hasVitest) {
      score.value += 10;
      tools.push('Vitest');
      findings.push({
        id: 'test-vitest',
        type: 'success',
        message: 'Vitest detected - modern, Vite-native testing',
        severity: 'low',
      });
    } else if (packageInfo.hasMocha) {
      score.value += 6;
      tools.push('Mocha');
    }

    if (packageInfo.hasTestingLibrary) {
      score.value += 3;
      tools.push('Testing Library');
    }

    if (packageInfo.hasCypress) {
      score.value += 5;
      tools.push('Cypress');
      findings.push({
        id: 'test-cypress',
        type: 'success',
        message: 'Cypress E2E testing detected',
        severity: 'low',
      });
    } else if (packageInfo.hasPlaywright) {
      score.value += 5;
      tools.push('Playwright');
      findings.push({
        id: 'test-playwright',
        type: 'success',
        message: 'Playwright E2E testing detected',
        severity: 'low',
      });
    }

    if (projectInfo.hasStorybook || configFiles.storybook?.length > 0) {
      score.value += 5;
      tools.push('Storybook');
      findings.push({
        id: 'test-storybook',
        type: 'success',
        message: 'Storybook detected for component testing',
        severity: 'low',
      });
    }

    if (packageInfo.hasNyc || packageInfo.hasC8) {
      score.value += 2;
      tools.push('Coverage Tools');
    }

    if (!projectInfo.hasTests && score.value === 0) {
      findings.push({
        id: 'test-none',
        type: 'error',
        message: 'No testing framework detected',
        severity: 'high',
        suggestion: 'Add testing with Jest, Vitest, or similar framework',
      });
    }

    if (score.value < 25 && score.value > 0) {
      const missing: string[] = [];
      if (!packageInfo.hasCypress && !packageInfo.hasPlaywright) {
        missing.push('E2E testing (Cypress or Playwright) (+5 pts)');
      }
      if (!projectInfo.hasStorybook && !(configFiles?.storybook?.length > 0)) {
        missing.push('Storybook for component testing (+5 pts)');
      }
      if (!packageInfo.hasTestingLibrary) {
        missing.push('Testing Library for component testing (+3 pts)');
      }
      if (!packageInfo.hasNyc && !packageInfo.hasC8) {
        missing.push('code coverage tools (+2 pts)');
      }
      if (missing.length > 0) {
        findings.push({
          id: 'testing-improvements',
          type: 'warning',
          message: `Testing Setup: Consider adding ${missing.join(', ')}`,
          severity: 'medium',
          suggestion: `These additions would improve your score (currently ${score.value}/25)`,
        });
      }
    }

    return { score: Math.min(25, score.value), findings, tools };
  }

  /**
   * CI/DX (25): CI 6 + ESLint 4 + Prettier 3 + README 3 + docgen 2
   *             + husky 3 + commitlint 2 + lint-staged 1 + editorconfig 1
   */
  private async evaluateCiDxExperience(configFiles: any, packageInfo: any): Promise<any> {
    const score = { value: 0 };
    const findings: Finding[] = [];
    const tools: string[] = [];

    const hasGitHubActions = await this.scanner.fileExists('.github/workflows');
    const hasGitLabCI = await this.scanner.fileExists('.gitlab-ci.yml');
    const hasCircleCI = await this.scanner.fileExists('.circleci/config.yml');

    if (hasGitHubActions || hasGitLabCI || hasCircleCI) {
      score.value += 6;
      tools.push('CI/CD');
      findings.push({
        id: 'ci-detected',
        type: 'success',
        message: 'CI/CD pipeline configured',
        severity: 'low',
      });
    }

    if (configFiles.eslint?.length > 0 || packageInfo.hasESLint) {
      score.value += 4;
      tools.push('ESLint');
      findings.push({
        id: 'dx-eslint',
        type: 'success',
        message: 'ESLint configured for code quality',
        severity: 'low',
      });
    }

    if (configFiles.prettier?.length > 0 || packageInfo.hasPrettier) {
      score.value += 3;
      tools.push('Prettier');
      findings.push({
        id: 'dx-prettier',
        type: 'success',
        message: 'Prettier configured for code formatting',
        severity: 'low',
      });
    }

    if (await this.scanner.fileExists('README.md')) {
      score.value += 3;
      findings.push({
        id: 'dx-readme',
        type: 'success',
        message: 'README.md found',
        severity: 'low',
      });
    }

    if (packageInfo.hasTypedoc || packageInfo.hasJSDoc) {
      score.value += 2;
      tools.push('Documentation Generation');
    }

    if (packageInfo.hasHusky) {
      score.value += 3;
      tools.push('Husky');
      findings.push({
        id: 'dx-husky',
        type: 'success',
        message: 'Husky git hooks configured',
        severity: 'low',
      });
    }

    if (packageInfo.hasCommitlint || packageInfo.hasCommitizen) {
      score.value += 2;
      tools.push('Commit Standards');
    }

    if (packageInfo.hasLintStaged) {
      score.value += 1;
      tools.push('lint-staged');
    }

    if (await this.scanner.fileExists('.editorconfig')) {
      score.value += 1;
      tools.push('EditorConfig');
    }

    if (score.value < 25) {
      const missing: string[] = [];
      if (!hasGitHubActions && !hasGitLabCI && !hasCircleCI) {
        missing.push('CI/CD pipeline (GitHub Actions, GitLab CI, or CircleCI) (+6 pts)');
      }
      if (!configFiles.eslint?.length && !packageInfo.hasESLint) {
        missing.push('ESLint for code quality (+4 pts)');
      }
      if (!configFiles.prettier?.length && !packageInfo.hasPrettier) {
        missing.push('Prettier for code formatting (+3 pts)');
      }
      if (!packageInfo.hasHusky) {
        missing.push('Husky for git hooks (+3 pts)');
      }
      if (missing.length > 0) {
        findings.push({
          id: 'cidx-improvements',
          type: 'warning',
          message: `CI/DX: Consider adding ${missing.join(', ')}`,
          severity: 'medium',
          suggestion: `These additions would improve your score (currently ${score.value}/25)`,
        });
      }
    }

    return { score: Math.min(25, score.value), findings, tools };
  }

  /**
   * Aggregate tool detection across every package.json in the repo so
   * monorepos are covered. Also collects peerDependencies and the framework
   * version so the framework category can score library-correctness.
   */
  private async detectToolsFromPackageJson(): Promise<any> {
    try {
      const packageJsonFiles = await this.scanner.scanFiles([
        '**/package.json',
        '!**/node_modules/**',
        '!**/dist/**',
        '!**/build/**',
      ]);

      if (packageJsonFiles.length === 0) {
        return {};
      }

      const allDeps: Record<string, string> = {};
      const allPeerDeps: Record<string, string> = {};
      const workspaces: string[] = [];
      let rootPackageType: string | undefined;

      for (const file of packageJsonFiles) {
        try {
          const pkg = JSON.parse(await this.scanner.readFile(file.path));

          if (pkg.dependencies) Object.assign(allDeps, pkg.dependencies);
          if (pkg.devDependencies) Object.assign(allDeps, pkg.devDependencies);
          if (pkg.peerDependencies) Object.assign(allPeerDeps, pkg.peerDependencies);

          if (pkg.workspaces) {
            workspaces.push(
              ...(Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages || [])
            );
          }

          if (file.path === 'package.json' && pkg.type) {
            rootPackageType = pkg.type;
          }
        } catch {
          // Unparseable package.json — skip
        }
      }

      // Identify the framework, its version, and whether any package declares
      // it as a peer dependency (library-correct posture).
      const frameworks: Array<{ name: string; dep: string }> = [
        { name: 'React', dep: 'react' },
        { name: 'Vue', dep: 'vue' },
        { name: 'Svelte', dep: 'svelte' },
        { name: 'Lit', dep: 'lit' },
        { name: 'Angular', dep: '@angular/core' },
      ];
      let framework: string | undefined;
      let frameworkMajor: number | undefined;
      let frameworkInPeerDeps = false;
      for (const { name, dep } of frameworks) {
        const version = allDeps[dep] || allPeerDeps[dep];
        if (version) {
          framework = name;
          const majorMatch = String(version).match(/(\d+)/);
          frameworkMajor = majorMatch ? parseInt(majorMatch[1], 10) : undefined;
          frameworkInPeerDeps = !!allPeerDeps[dep];
          break;
        }
      }

      return {
        // Build tools
        hasVite: !!allDeps.vite,
        hasWebpack: !!allDeps.webpack,
        hasRollup: !!allDeps.rollup,
        hasEsbuild: !!allDeps.esbuild,
        hasTsup: !!allDeps.tsup,
        hasParcel: !!allDeps.parcel,
        hasGulp: !!allDeps.gulp,
        hasGrunt: !!allDeps.grunt,
        hasSWC: !!allDeps['@swc/core'],
        hasBabel: !!allDeps['@babel/core'],
        hasPostCSS: !!allDeps.postcss,
        hasSass: !!allDeps.sass || !!allDeps['node-sass'],
        hasTypeScript: !!allDeps.typescript,

        // Framework posture (library-oriented)
        framework,
        frameworkMajor,
        frameworkInPeerDeps,
        hasJQuery: !!allDeps.jquery,

        // Testing
        hasJest: !!allDeps.jest,
        hasVitest: !!allDeps.vitest,
        hasMocha: !!allDeps.mocha,
        hasTestingLibrary: Object.keys(allDeps).some(dep => dep.includes('@testing-library')),
        hasCypress: !!allDeps.cypress,
        hasPlaywright: !!allDeps['@playwright/test'],
        hasNyc: !!allDeps.nyc,
        hasC8: !!allDeps.c8,

        // DX tools
        hasESLint: !!allDeps.eslint,
        hasPrettier: !!allDeps.prettier,
        hasHusky: !!allDeps.husky,
        hasLintStaged: !!allDeps['lint-staged'],
        hasCommitlint: !!allDeps['@commitlint/cli'],
        hasCommitizen: !!allDeps.commitizen,
        hasTypedoc: !!allDeps.typedoc,
        hasJSDoc: !!allDeps.jsdoc,

        // Storybook
        hasStorybook: Object.keys(allDeps).some(dep => dep.includes('storybook')),

        // Package type
        type: rootPackageType,

        // Monorepo indicators
        isMonorepo: workspaces.length > 0 || packageJsonFiles.length > 1,
      };
    } catch {
      return {};
    }
  }
}
