import type { AuditConfig, CategoryResult, Finding } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';

interface ToolingScores {
  buildTools: number;
  frameworkRuntime: number;
  testingSetup: number;
  ciDxExperience: number;
}

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
    
    // Detect project info
    const projectInfo = await this.scanner.detectProjectInfo();
    const configFiles = await this.scanner.findConfigFiles();
    const packageInfo = await this.detectToolsFromPackageJson();
    
    // Debug: Log what we found
    console.log('[ToolingAuditor] Project Info:', projectInfo);
    console.log('[ToolingAuditor] Config Files Found:', Object.keys(configFiles).filter(k => configFiles[k]?.length > 0));
    console.log('[ToolingAuditor] Package.json tools detected:', Object.keys(packageInfo).filter(k => packageInfo[k] === true));
    
    // Calculate scores for each category
    const scores: ToolingScores = {
      buildTools: 0,
      frameworkRuntime: 0,
      testingSetup: 0,
      ciDxExperience: 0
    };
    
    // 1. BUILD TOOLS (25 pts)
    const buildToolsResult = await this.evaluateBuildTools(configFiles, packageInfo);
    scores.buildTools = buildToolsResult.score;
    findings.push(...buildToolsResult.findings);
    toolsDetected.push(...buildToolsResult.tools);
    
    // 2. FRAMEWORKS & RUNTIME (25 pts)
    const frameworkResult = await this.evaluateFrameworkRuntime(projectInfo, packageInfo, configFiles);
    scores.frameworkRuntime = frameworkResult.score;
    findings.push(...frameworkResult.findings);
    toolsDetected.push(...frameworkResult.tools);
    
    // 3. TESTING SETUP (25 pts)
    const testingResult = await this.evaluateTestingSetup(configFiles, packageInfo, projectInfo);
    scores.testingSetup = testingResult.score;
    findings.push(...testingResult.findings);
    toolsDetected.push(...testingResult.tools);
    
    // 4. CI/CD & DX (25 pts)
    const ciDxResult = await this.evaluateCiDxExperience(configFiles, packageInfo);
    scores.ciDxExperience = ciDxResult.score;
    findings.push(...ciDxResult.findings);
    toolsDetected.push(...ciDxResult.tools);

    // Calculate total score
    const totalScore = Math.round(
      scores.buildTools + 
      scores.frameworkRuntime + 
      scores.testingSetup + 
      scores.ciDxExperience
    );

    // Add breakdown to findings
    findings.unshift({
      id: 'tooling-breakdown',
      type: 'info',
      message: `Scoring: Build Tools (${scores.buildTools}/25), Framework (${scores.frameworkRuntime}/25), Testing (${scores.testingSetup}/25), CI/DX (${scores.ciDxExperience}/25)`,
      severity: 'low'
    });

    return {
      id: 'tooling',
      name: 'Tooling & Infrastructure',
      score: totalScore,
      grade: this.getGrade(totalScore),
      weight: 0.10,
      findings,
      metrics: {
        filesScanned: Object.values(configFiles).flat().length,
        toolsDetected,
        framework: projectInfo.type,
        hasTypeScript: projectInfo.hasTypeScript,
        hasStorybook: projectInfo.hasStorybook,
        hasTests: projectInfo.hasTests,
        scoreBreakdown: scores
      },
    };
  }

  private async evaluateBuildTools(configFiles: any, packageInfo: any): Promise<any> {
    const score = { value: 0 };
    const findings: Finding[] = [];
    const tools: string[] = [];

    // Check for modern build tools
    if (configFiles.vite?.length > 0 || packageInfo.hasVite) {
      score.value += 10;
      tools.push('Vite');
      findings.push({
        id: 'build-vite',
        type: 'success',
        message: 'Vite detected - modern, fast build tool',
        severity: 'low'
      });
    } else if (configFiles.webpack?.length > 0 || packageInfo.hasWebpack) {
      score.value += 8;
      tools.push('Webpack');
      findings.push({
        id: 'build-webpack',
        type: 'success',
        message: 'Webpack detected - robust bundler',
        severity: 'low'
      });
    } else if (packageInfo.hasRollup) {
      score.value += 8;
      tools.push('Rollup');
      findings.push({
        id: 'build-rollup',
        type: 'success',
        message: 'Rollup detected - efficient module bundler',
        severity: 'low'
      });
    } else if (packageInfo.hasEsbuild) {
      score.value += 9;
      tools.push('esbuild');
      findings.push({
        id: 'build-esbuild',
        type: 'success',
        message: 'esbuild detected - ultra-fast bundler',
        severity: 'low'
      });
    }

    // Check for legacy tools (penalty)
    if (packageInfo.hasGulp || packageInfo.hasGrunt) {
      score.value = Math.max(0, score.value - 10);
      findings.push({
        id: 'build-legacy',
        type: 'warning',
        message: 'Legacy build tools detected (Gulp/Grunt)',
        severity: 'medium',
        suggestion: 'Consider migrating to modern build tools like Vite or esbuild'
      });
    }

    // Additional build features
    if (packageInfo.hasPostCSS) {
      score.value += 3;
      tools.push('PostCSS');
    }
    if (packageInfo.hasSWC || packageInfo.hasBabel || configFiles.babel?.length > 0) {
      score.value += 2;
      tools.push(packageInfo.hasSWC ? 'SWC' : 'Babel');
    }

    // Package manager bonus
    if (await this.scanner.fileExists('pnpm-lock.yaml')) {
      score.value += 2;
      tools.push('pnpm');
    } else if (await this.scanner.fileExists('yarn.lock')) {
      score.value += 1;
      tools.push('Yarn');
    }

    // Module resolution
    if (packageInfo.type === 'module') {
      score.value += 2;
      findings.push({
        id: 'build-esm',
        type: 'success',
        message: 'ESM modules configured',
        severity: 'low'
      });
    }

    // Add improvement suggestions if score is not maxed out
    if (score.value < 25) {
      const missing: string[] = [];
      if (!packageInfo.hasVite && !packageInfo.hasWebpack && !packageInfo.hasRollup && !packageInfo.hasEsbuild) {
        missing.push('modern bundler (Vite, esbuild, or Webpack)');
      }
      if (!packageInfo.hasPostCSS) {
        missing.push('PostCSS for CSS processing');
      }
      if (packageInfo.type !== 'module') {
        missing.push('ESM modules (set "type": "module" in package.json)');
      }
      if (missing.length > 0) {
        findings.push({
          id: 'build-improvements',
          type: 'warning',
          message: `Build Tools: Missing ${missing.join(', ')}`,
          severity: 'medium',
          suggestion: `Add these tools to improve your build setup and score (currently ${score.value}/25)`
        });
      }
    }

    return {
      score: Math.min(25, score.value),
      findings,
      tools
    };
  }

  private async evaluateFrameworkRuntime(projectInfo: any, packageInfo: any, configFiles?: any): Promise<any> {
    const score = { value: 0 };
    const findings: Finding[] = [];
    const tools: string[] = [];

    // Modern frameworks (10 pts)
    if (packageInfo.hasReact || projectInfo.type === 'react') {
      score.value += 10;
      tools.push('React');
      
      // Framework-specific tools
      if (packageInfo.hasNext) {
        score.value += 3;
        tools.push('Next.js');
        findings.push({
          id: 'framework-nextjs',
          type: 'success',
          message: 'Next.js detected - full-stack React framework',
          severity: 'low'
        });
      } else if (packageInfo.hasRemix) {
        score.value += 3;
        tools.push('Remix');
      }
    } else if (packageInfo.hasVue) {
      score.value += 10;
      tools.push('Vue');
      
      if (packageInfo.hasNuxt) {
        score.value += 3;
        tools.push('Nuxt');
      }
    } else if (packageInfo.hasSvelte) {
      score.value += 10;
      tools.push('Svelte');
      
      if (packageInfo.hasSvelteKit) {
        score.value += 3;
        tools.push('SvelteKit');
      }
    } else if (packageInfo.hasLit || packageInfo.hasWebComponents) {
      score.value += 10;
      tools.push('Web Components/Lit');
      findings.push({
        id: 'framework-webcomponents',
        type: 'success',
        message: 'Web Components detected - standards-based approach',
        severity: 'low'
      });
    } else if (packageInfo.hasAngular) {
      score.value += 8;
      tools.push('Angular');
    }

    // TypeScript (5 pts)
    if (projectInfo.hasTypeScript || configFiles.typescript?.length > 0) {
      score.value += 5;
      tools.push('TypeScript');
      findings.push({
        id: 'runtime-typescript',
        type: 'success',
        message: 'TypeScript detected - type safety enabled',
        severity: 'low'
      });
    }

    // Penalties for outdated approaches
    if (packageInfo.hasJQuery && !packageInfo.hasReact && !packageInfo.hasVue) {
      score.value = Math.max(0, score.value - 10);
      findings.push({
        id: 'framework-jquery',
        type: 'error',
        message: 'jQuery detected as primary framework',
        severity: 'high',
        suggestion: 'Consider migrating to a modern component-based framework'
      });
    }

    // State management bonus
    if (packageInfo.hasRedux || packageInfo.hasZustand || packageInfo.hasMobX || packageInfo.hasRecoil || packageInfo.hasPinia) {
      score.value += 2;
      tools.push('State Management');
    }

    // Add improvement suggestions if score is not maxed out
    if (score.value < 25) {
      const missing: string[] = [];
      if (!projectInfo.hasTypeScript && (!configFiles || configFiles.typescript?.length === 0)) {
        missing.push('TypeScript for type safety (+5 pts)');
      }
      if (!packageInfo.hasReact && !packageInfo.hasVue && !packageInfo.hasSvelte && !packageInfo.hasAngular && !packageInfo.hasLit) {
        missing.push('modern component framework');
      }
      if (!packageInfo.hasRedux && !packageInfo.hasZustand && !packageInfo.hasMobX && !packageInfo.hasRecoil && !packageInfo.hasPinia) {
        missing.push('state management solution (+2 pts)');
      }
      if (missing.length > 0) {
        findings.push({
          id: 'framework-improvements',
          type: 'warning',
          message: `Framework & Runtime: Consider adding ${missing.join(', ')}`,
          severity: 'medium',
          suggestion: `These additions would improve your score (currently ${score.value}/25)`
        });
      }
    }

    return {
      score: Math.min(25, score.value),
      findings,
      tools
    };
  }

  private async evaluateTestingSetup(configFiles: any, packageInfo: any, projectInfo: any): Promise<any> {
    const score = { value: 0 };
    const findings: Finding[] = [];
    const tools: string[] = [];

    // Unit testing frameworks (10 pts)
    if (configFiles.jest?.length > 0 || packageInfo.hasJest) {
      score.value += 10;
      tools.push('Jest');
      findings.push({
        id: 'test-jest',
        type: 'success',
        message: 'Jest testing framework detected',
        severity: 'low'
      });
    } else if (packageInfo.hasVitest) {
      score.value += 10;
      tools.push('Vitest');
      findings.push({
        id: 'test-vitest',
        type: 'success',
        message: 'Vitest detected - modern, Vite-native testing',
        severity: 'low'
      });
    } else if (packageInfo.hasMocha) {
      score.value += 6;
      tools.push('Mocha');
    }

    // Testing libraries
    if (packageInfo.hasTestingLibrary) {
      score.value += 3;
      tools.push('Testing Library');
    }

    // E2E testing (5 pts)
    if (packageInfo.hasCypress) {
      score.value += 5;
      tools.push('Cypress');
      findings.push({
        id: 'test-cypress',
        type: 'success',
        message: 'Cypress E2E testing detected',
        severity: 'low'
      });
    } else if (packageInfo.hasPlaywright) {
      score.value += 5;
      tools.push('Playwright');
      findings.push({
        id: 'test-playwright',
        type: 'success',
        message: 'Playwright E2E testing detected',
        severity: 'low'
      });
    }

    // Storybook testing (5 pts)
    if (projectInfo.hasStorybook || configFiles.storybook?.length > 0) {
      score.value += 5;
      tools.push('Storybook');
      findings.push({
        id: 'test-storybook',
        type: 'success',
        message: 'Storybook detected for component testing',
        severity: 'low'
      });
    }

    // Coverage tools
    if (packageInfo.hasNyc || packageInfo.hasC8) {
      score.value += 2;
      tools.push('Coverage Tools');
    }

    // No tests penalty
    if (!projectInfo.hasTests && score.value === 0) {
      findings.push({
        id: 'test-none',
        type: 'error',
        message: 'No testing framework detected',
        severity: 'high',
        suggestion: 'Add testing with Jest, Vitest, or similar framework'
      });
    }

    // Add improvement suggestions if score is not maxed out
    if (score.value < 25 && score.value > 0) {
      const missing: string[] = [];
      if (!packageInfo.hasCypress && !packageInfo.hasPlaywright) {
        missing.push('E2E testing (Cypress or Playwright) (+5 pts)');
      }
      if (!projectInfo.hasStorybook && (!configFiles || configFiles.storybook?.length === 0)) {
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
          suggestion: `These additions would improve your score (currently ${score.value}/25)`
        });
      }
    }

    return {
      score: Math.min(25, score.value),
      findings,
      tools
    };
  }

  private async evaluateCiDxExperience(configFiles: any, packageInfo: any): Promise<any> {
    const score = { value: 0 };
    const findings: Finding[] = [];
    const tools: string[] = [];

    // CI/CD (5 pts)
    const hasGitHubActions = await this.scanner.fileExists('.github/workflows');
    const hasGitLabCI = await this.scanner.fileExists('.gitlab-ci.yml');
    const hasCircleCI = await this.scanner.fileExists('.circleci/config.yml');
    
    if (hasGitHubActions || hasGitLabCI || hasCircleCI) {
      score.value += 5;
      tools.push('CI/CD');
      findings.push({
        id: 'ci-detected',
        type: 'success',
        message: 'CI/CD pipeline configured',
        severity: 'low'
      });
    }

    // Linting and formatting (5 pts)
    if (configFiles.eslint?.length > 0 || packageInfo.hasESLint) {
      score.value += 3;
      tools.push('ESLint');
      findings.push({
        id: 'dx-eslint',
        type: 'success',
        message: 'ESLint configured for code quality',
        severity: 'low'
      });
    }
    
    if (configFiles.prettier?.length > 0 || packageInfo.hasPrettier) {
      score.value += 2;
      tools.push('Prettier');
      findings.push({
        id: 'dx-prettier',
        type: 'success',
        message: 'Prettier configured for code formatting',
        severity: 'low'
      });
    }

    // Documentation (5 pts)
    const hasReadme = await this.scanner.fileExists('README.md');
    const hasTypedoc = packageInfo.hasTypedoc;
    
    if (hasReadme) {
      score.value += 3;
      findings.push({
        id: 'dx-readme',
        type: 'success',
        message: 'README.md found',
        severity: 'low'
      });
    }
    
    if (hasTypedoc || packageInfo.hasJSDoc) {
      score.value += 2;
      tools.push('Documentation Generation');
    }

    // Git hooks and commit tools (5 pts)
    if (packageInfo.hasHusky) {
      score.value += 3;
      tools.push('Husky');
      findings.push({
        id: 'dx-husky',
        type: 'success',
        message: 'Husky git hooks configured',
        severity: 'low'
      });
    }
    
    if (packageInfo.hasCommitlint || packageInfo.hasCommitizen) {
      score.value += 2;
      tools.push('Commit Standards');
    }

    // Additional DX tools
    if (packageInfo.hasLintStaged) {
      score.value += 1;
      tools.push('lint-staged');
    }
    
    if (await this.scanner.fileExists('.editorconfig')) {
      score.value += 1;
      tools.push('EditorConfig');
    }

    // Development environment
    if (await this.scanner.fileExists('.env.example') || await this.scanner.fileExists('.env.sample')) {
      score.value += 1;
      findings.push({
        id: 'dx-env-example',
        type: 'success',
        message: 'Environment example file provided',
        severity: 'low'
      });
    }

    // Add improvement suggestions if score is not maxed out
    if (score.value < 25) {
      const missing: string[] = [];
      if (!hasGitHubActions && !hasGitLabCI && !hasCircleCI) {
        missing.push('CI/CD pipeline (GitHub Actions, GitLab CI, or CircleCI) (+5 pts)');
      }
      if (!configFiles.eslint?.length && !packageInfo.hasESLint) {
        missing.push('ESLint for code quality (+3 pts)');
      }
      if (!configFiles.prettier?.length && !packageInfo.hasPrettier) {
        missing.push('Prettier for code formatting (+2 pts)');
      }
      if (!packageInfo.hasHusky) {
        missing.push('Husky for git hooks (+3 pts)');
      }
      if (!hasReadme) {
        missing.push('README.md documentation (+3 pts)');
      }
      if (missing.length > 0) {
        findings.push({
          id: 'cidx-improvements',
          type: 'warning',
          message: `CI/DX: Consider adding ${missing.join(', ')}`,
          severity: 'medium',
          suggestion: `These additions would improve your score (currently ${score.value}/25)`
        });
      }
    }

    return {
      score: Math.min(25, score.value),
      findings,
      tools
    };
  }

  private getGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private async detectToolsFromPackageJson(): Promise<any> {
    try {
      // Find ALL package.json files in the project
      const packageJsonFiles = await this.scanner.scanFiles(['**/package.json']);
      console.log(`[ToolingAuditor] Found ${packageJsonFiles.length} package.json files`);
      
      // Log each package.json location for debugging
      packageJsonFiles.forEach(file => {
        console.log(`[ToolingAuditor] Found package.json at: ${file.path}`);
      });
      
      if (packageJsonFiles.length === 0) {
        console.warn('[ToolingAuditor] No package.json files found in project');
        return {};
      }
      
      // Aggregate all dependencies from all package.json files
      const allDeps: Record<string, string> = {};
      const workspaces: string[] = [];
      let rootPackageType: string | undefined;
      
      for (const file of packageJsonFiles) {
        try {
          const content = await this.scanner.readFile(file.path);
          const pkg = JSON.parse(content);
          
          console.log(`[ToolingAuditor] Processing ${file.path}`);
          
          // Merge dependencies
          if (pkg.dependencies) {
            Object.assign(allDeps, pkg.dependencies);
          }
          if (pkg.devDependencies) {
            Object.assign(allDeps, pkg.devDependencies);
          }
          
          // Check for workspaces (monorepo indicator)
          if (pkg.workspaces) {
            workspaces.push(...(Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages || []));
          }
          
          // Get package type from root package.json
          if (file.path === 'package.json' && pkg.type) {
            rootPackageType = pkg.type;
          }
          
          // Log package info for debugging
          console.log(`[ToolingAuditor] ${file.path} - Dependencies: ${Object.keys(pkg.dependencies || {}).length}, DevDependencies: ${Object.keys(pkg.devDependencies || {}).length}`);
        } catch (e) {
          console.error(`[ToolingAuditor] Error reading ${file.path}:`, e);
        }
      }
      
      console.log(`[ToolingAuditor] Total unique dependencies found: ${Object.keys(allDeps).length}`);
      if (workspaces.length > 0) {
        console.log(`[ToolingAuditor] Monorepo detected with workspaces: ${workspaces.join(', ')}`);
      }
      if (packageJsonFiles.length > 1) {
        console.log(`[ToolingAuditor] Multiple package.json files detected (${packageJsonFiles.length}), treating as monorepo`);
      }
      
      // Log some key detected tools for debugging
      const keyTools = ['react', 'vue', 'angular', 'webpack', 'vite', 'typescript', 'jest', 'eslint'];
      const detectedTools = keyTools.filter(tool => allDeps[tool]);
      if (detectedTools.length > 0) {
        console.log(`[ToolingAuditor] Key tools detected: ${detectedTools.join(', ')}`);
      }

      return {
        // Build tools
        hasVite: !!allDeps.vite,
        hasWebpack: !!allDeps.webpack,
        hasRollup: !!allDeps.rollup,
        hasEsbuild: !!allDeps.esbuild,
        hasParcel: !!allDeps.parcel,
        hasGulp: !!allDeps.gulp,
        hasGrunt: !!allDeps.grunt,
        hasSWC: !!allDeps['@swc/core'],
        hasBabel: !!allDeps['@babel/core'],
        hasPostCSS: !!allDeps.postcss,
        
        // Frameworks
        hasReact: !!allDeps.react,
        hasNext: !!allDeps.next,
        hasRemix: !!allDeps['@remix-run/react'],
        hasVue: !!allDeps.vue,
        hasNuxt: !!allDeps.nuxt,
        hasSvelte: !!allDeps.svelte,
        hasSvelteKit: !!allDeps['@sveltejs/kit'],
        hasAngular: !!allDeps['@angular/core'],
        hasLit: !!allDeps.lit || !!allDeps['@lit/reactive-element'],
        hasWebComponents: !!allDeps['@webcomponents/webcomponentsjs'],
        hasJQuery: !!allDeps.jquery,
        
        // State management
        hasRedux: !!allDeps.redux || !!allDeps['@reduxjs/toolkit'],
        hasZustand: !!allDeps.zustand,
        hasMobX: !!allDeps.mobx,
        hasRecoil: !!allDeps.recoil,
        hasPinia: !!allDeps.pinia,
        
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
        isMonorepo: workspaces.length > 0 || packageJsonFiles.length > 1
      };
    } catch (error) {
      console.error('[ToolingAuditor] Error in detectToolsFromPackageJson:', error);
      return {};
    }
  }
}