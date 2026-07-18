import type { AuditConfig, CategoryResult, Finding } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';

interface AIReadinessScores {
  contractQuality: number;
  discoverability: number;
  agentGuidance: number;
  exampleDensity: number;
  guardrails: number;
}

/** Presence checklist for machine-consumable artifacts, surfaced in the
 * dashboard as-is so every check is auditable. */
interface ArtifactChecklist {
  agentInstructions: boolean; // CLAUDE.md / AGENTS.md
  editorRules: boolean; // .cursorrules / copilot-instructions
  llmsTxt: boolean;
  mcpConfig: boolean;
  componentMetadata: boolean; // custom-elements.json / *.meta.json
  exportsMap: boolean;
  typesEntry: boolean;
  barrelExport: boolean;
  eslintConfig: boolean;
  sharedLintConfig: boolean;
  strictTypescript: boolean;
  changelogMachinery: boolean; // CHANGELOG.md / .changeset
  versionedPackage: boolean;
}

/**
 * Experimental category: how consumable the design system is for AI coding
 * assistants — treating the system as an API whose primary consumer is an
 * agent that must infer correct usage from public artifacts alone.
 *
 * Point ceilings (sum 100):
 *   Contract quality (25): props contracts 10 + JSDoc on contracts 8
 *     + no `any` in contracts 4 + constrained unions 3
 *   Discoverability (15): exports map 6 + types entry 3 + barrel export 3
 *     + naming consistency 3
 *   Agent guidance (25): CLAUDE.md/AGENTS.md 8 + editor rules 5 + llms.txt 6
 *     + MCP config 3 + component metadata 3
 *   Example density (20): story coverage 10 + doc code snippets 5 + tests 5
 *   Guardrails (15): ESLint 3 + shared lint config 3 + strict TS 4
 *     + changelog machinery 3 + versioned package 2
 *
 * This category is reported but NOT included in the weighted overall score
 * (no entry in CATEGORY_WEIGHTS) while it is experimental.
 */
export class AIReadinessAuditor {
  private scanner: FileScanner;

  constructor(config: AuditConfig) {
    this.scanner = new FileScanner(config);
  }

  async audit(): Promise<CategoryResult> {
    const findings: Finding[] = [];

    const componentFiles = await this.scanner.scanFiles([
      'src/components/**/*.{tsx,jsx,vue,svelte}',
      'components/**/*.{tsx,jsx,vue,svelte}',
      'packages/*/src/**/*.{tsx,jsx,vue,svelte}',
      'src/**/*.{tsx,jsx}',
      '!**/*.test.*',
      '!**/*.spec.*',
      '!**/*.stories.*',
      '!**/index.*',
    ]);
    const componentPaths = componentFiles.map(f => f.path);

    const contracts = await this.analyzeContracts(componentPaths);
    const artifacts = await this.detectArtifacts();
    const examples = await this.analyzeExamples(componentPaths.length);

    const scores: AIReadinessScores = {
      contractQuality: this.scoreContractQuality(contracts, componentPaths.length, findings),
      discoverability: this.scoreDiscoverability(artifacts, componentPaths, findings),
      agentGuidance: this.scoreAgentGuidance(artifacts, findings),
      exampleDensity: this.scoreExampleDensity(examples, componentPaths.length, findings),
      guardrails: this.scoreGuardrails(artifacts, findings),
    };

    const totalScore = Math.round(
      scores.contractQuality +
        scores.discoverability +
        scores.agentGuidance +
        scores.exampleDensity +
        scores.guardrails
    );

    findings.unshift({
      id: 'ai-readiness-breakdown',
      type: 'info',
      message:
        `Scoring: Contract Quality (${scores.contractQuality}/25), ` +
        `Discoverability (${scores.discoverability}/15), ` +
        `Agent Guidance (${scores.agentGuidance}/25), ` +
        `Example Density (${scores.exampleDensity}/20), ` +
        `Guardrails (${scores.guardrails}/15)`,
      severity: 'low',
    });

    return {
      id: 'ai-readiness',
      name: 'AI Readiness',
      score: Math.max(0, Math.min(100, totalScore)),
      grade: '', // stamped by the engine
      weight: 0, // experimental — intentionally absent from CATEGORY_WEIGHTS
      findings,
      metrics: {
        filesScanned: componentPaths.length,
        componentCount: componentPaths.length,
        propContractCoverage: contracts.contractCoverage,
        jsdocCoverage: contracts.jsdocCoverage,
        anyFreeContracts: contracts.anyFreeCoverage,
        unionTypedContracts: contracts.unionCoverage,
        storyCoverage: examples.storyCoverage,
        docSnippetCount: examples.docSnippetCount,
        testFileCount: examples.testFileCount,
        artifacts: artifacts as unknown as Record<string, boolean>,
        scoreBreakdown: scores,
      },
    };
  }

  // -------------------------------------------------------------------
  // Contract analysis — the props contract IS the API documentation an
  // agent consumes through IntelliSense and type declarations.
  // -------------------------------------------------------------------

  private async analyzeContracts(componentPaths: string[]): Promise<{
    contractCoverage: number;
    jsdocCoverage: number;
    anyFreeCoverage: number;
    unionCoverage: number;
    undocumented: string[];
  }> {
    // Cap reads so huge repos stay fast; the sample is deterministic (sorted).
    const paths = [...componentPaths].sort().slice(0, 200);
    let withContract = 0;
    let withJsdoc = 0;
    let anyFree = 0;
    let withUnions = 0;
    const undocumented: string[] = [];

    for (const path of paths) {
      let content: string;
      try {
        content = await this.scanner.readFile(path);
      } catch {
        continue;
      }

      // Same signal ComponentAuditor uses: a declared props contract.
      const contractMatch = content.match(
        /(?:export\s+)?(?:interface|type)\s+\w*Props\b[^{=]*[{=]([\s\S]{0,3000}?)(?:\n\}|\n\w)/
      );
      if (!contractMatch) {
        undocumented.push(path);
        continue;
      }
      withContract++;

      const body = contractMatch[1];
      if (body.includes('/**')) withJsdoc++;
      if (!/\bany\b/.test(body)) anyFree++;
      if (/'[^']+'\s*\|\s*'/.test(body) || /"[^"]+"\s*\|\s*"/.test(body)) withUnions++;
    }

    const denom = paths.length || 1;
    return {
      contractCoverage: Math.round((withContract / denom) * 100),
      jsdocCoverage: withContract > 0 ? Math.round((withJsdoc / withContract) * 100) : 0,
      anyFreeCoverage: withContract > 0 ? Math.round((anyFree / withContract) * 100) : 0,
      unionCoverage: withContract > 0 ? Math.round((withUnions / withContract) * 100) : 0,
      undocumented,
    };
  }

  private scoreContractQuality(
    contracts: Awaited<ReturnType<AIReadinessAuditor['analyzeContracts']>>,
    componentCount: number,
    findings: Finding[]
  ): number {
    if (componentCount === 0) {
      findings.push({
        id: 'air-no-components',
        type: 'info',
        message: 'No component files found — contract quality could not be assessed',
        severity: 'low',
      });
      return 0;
    }

    let score = 0;
    score += (contracts.contractCoverage / 100) * 10;
    score += (contracts.jsdocCoverage / 100) * 8;
    score += (contracts.anyFreeCoverage / 100) * 4;
    score += (contracts.unionCoverage / 100) * 3;

    if (contracts.jsdocCoverage < 50) {
      findings.push({
        id: 'air-jsdoc-coverage',
        type: 'warning',
        message: `Only ${contracts.jsdocCoverage}% of props contracts contain JSDoc — prop descriptions are what AI assistants (and IntelliSense) read to infer correct usage`,
        severity: 'medium',
        suggestion:
          'Add /** */ descriptions to non-obvious props, including valid values and defaults',
      });
    }
    if (contracts.unionCoverage < 30) {
      findings.push({
        id: 'air-open-props',
        type: 'warning',
        message: `Only ${contracts.unionCoverage}% of props contracts use constrained union types — open string props force assistants to guess valid values`,
        severity: 'medium',
        suggestion:
          "Prefer constrained unions ('primary' | 'secondary') over string for variant-like props",
      });
    } else {
      findings.push({
        id: 'air-unions-ok',
        type: 'success',
        message: `${contracts.unionCoverage}% of props contracts constrain values with union types — assistants can enumerate valid options`,
        severity: 'low',
      });
    }

    return Math.min(25, Math.round(score));
  }

  // -------------------------------------------------------------------
  // Artifact detection — file presence checks across the repo, including
  // monorepo package roots.
  // -------------------------------------------------------------------

  private async detectArtifacts(): Promise<ArtifactChecklist> {
    const [
      agentInstructions,
      editorRules,
      llmsTxt,
      mcpConfig,
      componentMetadata,
      changelogMachinery,
    ] = await Promise.all([
      this.anyExists(['CLAUDE.md', 'AGENTS.md', 'AGENT.md']),
      this.anyExists([
        '.cursorrules',
        '.cursor/rules',
        '.github/copilot-instructions.md',
        '.windsurfrules',
      ]),
      this.anyExists(['llms.txt', 'llms-full.txt', 'public/llms.txt']),
      this.anyExists(['.mcp.json', 'mcp.json', '.story-ui/config.js', 'story-ui.config.js']),
      (await this.scanner.scanFiles(['**/custom-elements.json', '**/*.meta.json'])).length > 0,
      this.anyExists(['CHANGELOG.md', '.changeset/config.json']),
    ]);

    // Package manifests: root plus monorepo packages, so monorepos are not
    // punished for a private workspace root.
    const manifests = await this.readPackageManifests();
    const exportsMap = manifests.some(m => m.exports !== undefined);
    const typesEntry = manifests.some(m => m.types !== undefined || m.typings !== undefined);
    const versionedPackage = manifests.some(m => m.version && m.private !== true);
    const sharedLintConfig = manifests.some(m => {
      if (typeof m.name === 'string' && /eslint-(config|plugin)/.test(m.name)) return true;
      // `exports` may also be a plain string entry point — only object maps
      // can carry an eslint-specific subpath.
      if (m.exports && typeof m.exports === 'object') {
        return Object.keys(m.exports).some(k => /eslint/.test(k));
      }
      return false;
    });

    const barrelExport =
      (await this.scanner.scanFiles(['src/index.{ts,tsx,js}', 'packages/*/src/index.{ts,tsx,js}']))
        .length > 0;

    const eslintConfig =
      (await this.scanner.scanFiles([
        '.eslintrc*',
        'eslint.config.{js,mjs,cjs,ts}',
        'packages/*/eslint.config.{js,mjs,cjs,ts}',
      ])).length > 0;

    const strictTypescript = await this.detectStrictTs();

    return {
      agentInstructions,
      editorRules,
      llmsTxt,
      mcpConfig,
      componentMetadata,
      exportsMap,
      typesEntry,
      barrelExport,
      eslintConfig,
      sharedLintConfig,
      strictTypescript,
      changelogMachinery,
      versionedPackage,
    };
  }

  private async anyExists(paths: string[]): Promise<boolean> {
    for (const path of paths) {
      if (await this.scanner.fileExists(path)) return true;
    }
    return false;
  }

  private async readPackageManifests(): Promise<Record<string, unknown>[]> {
    const files = await this.scanner.scanFiles(['package.json', 'packages/*/package.json']);
    const manifests: Record<string, unknown>[] = [];
    for (const file of files) {
      try {
        manifests.push(JSON.parse(await this.scanner.readFile(file.path)));
      } catch {
        // Unparseable manifest — skip rather than fail the category
      }
    }
    return manifests;
  }

  private async detectStrictTs(): Promise<boolean> {
    const files = await this.scanner.scanFiles(['tsconfig*.json', 'packages/*/tsconfig*.json']);
    for (const file of files) {
      try {
        const content = await this.scanner.readFile(file.path);
        if (/"strict"\s*:\s*true/.test(content)) return true;
      } catch {
        // ignore unreadable tsconfig
      }
    }
    return false;
  }

  private scoreDiscoverability(
    artifacts: ArtifactChecklist,
    componentPaths: string[],
    findings: Finding[]
  ): number {
    let score = 0;

    if (artifacts.exportsMap) {
      score += 6;
    } else {
      findings.push({
        id: 'air-exports-map',
        type: 'warning',
        message:
          'No package.json `exports` map found — agents and tooling cannot reliably resolve public entry points',
        severity: 'medium',
        suggestion: 'Add an `exports` map with ESM entries and type declarations per entry point',
      });
    }

    if (artifacts.typesEntry) {
      score += 3;
    } else {
      findings.push({
        id: 'air-types-entry',
        type: 'warning',
        message:
          'No `types` entry in any package manifest — type declarations are the primary machine-readable API contract',
        severity: 'medium',
        suggestion: 'Publish .d.ts files and point to them via `types` (or per-export `types`)',
      });
    }

    if (artifacts.barrelExport) score += 3;

    // Predictable naming: PascalCase file names map to importable exports.
    const named = componentPaths.filter(p => /\/[A-Z][A-Za-z0-9]*\.(t|j)sx?$/.test(p)).length;
    const namingRatio = componentPaths.length > 0 ? named / componentPaths.length : 0;
    score += namingRatio * 3;

    return Math.min(15, Math.round(score));
  }

  private scoreAgentGuidance(artifacts: ArtifactChecklist, findings: Finding[]): number {
    let score = 0;

    if (artifacts.agentInstructions) {
      score += 8;
      findings.push({
        id: 'air-agent-instructions',
        type: 'success',
        message: 'Agent instructions file present (CLAUDE.md / AGENTS.md)',
        severity: 'low',
      });
    } else {
      findings.push({
        id: 'air-agent-instructions',
        type: 'warning',
        message:
          'No agent instructions file (CLAUDE.md or AGENTS.md) — AI coding assistants get no project-level guidance on how to consume this system',
        severity: 'high',
        suggestion:
          'Add an AGENTS.md (or CLAUDE.md) describing import paths, component conventions, token usage rules, and common mistakes to avoid',
      });
    }

    if (artifacts.editorRules) {
      score += 5;
    } else {
      findings.push({
        id: 'air-editor-rules',
        type: 'warning',
        message:
          'No editor agent rules (.cursorrules / .github/copilot-instructions.md) — in-editor assistants generate against defaults instead of your conventions',
        severity: 'medium',
        suggestion: 'Add editor rule files mirroring your agent instructions',
      });
    }

    if (artifacts.llmsTxt) {
      score += 6;
    } else {
      findings.push({
        id: 'air-llms-txt',
        type: 'warning',
        message:
          'No llms.txt — LLM crawlers and context loaders have no curated entry point to your documentation',
        severity: 'medium',
        suggestion:
          'Add llms.txt at the repo/docs root linking the docs an assistant should read first',
      });
    }

    if (artifacts.mcpConfig) {
      score += 3;
      findings.push({
        id: 'air-mcp',
        type: 'success',
        message: 'MCP configuration detected — the system is queryable by agents at runtime',
        severity: 'low',
      });
    }

    if (artifacts.componentMetadata) {
      score += 3;
    } else {
      findings.push({
        id: 'air-component-meta',
        type: 'info',
        message:
          'No machine-readable component metadata (custom-elements.json or *.meta.json) found',
        severity: 'low',
        suggestion:
          'Generate component metadata (custom-elements manifest, react-docgen output, or per-component meta.json) so agents can enumerate the API without parsing source',
      });
    }

    return Math.min(25, Math.round(score));
  }

  private async analyzeExamples(componentCount: number): Promise<{
    storyCoverage: number;
    docSnippetCount: number;
    testFileCount: number;
  }> {
    const stories = await this.scanner.scanFiles(['**/*.stories.{tsx,jsx,ts,js,mdx}']);
    const tests = await this.scanner.scanFiles(['**/*.{test,spec}.{tsx,jsx,ts,js}']);

    // Code fences in markdown docs are copy-pasteable usage examples.
    const docs = (await this.scanner.scanFiles(['**/*.{md,mdx}', '!**/CHANGELOG.md'])).slice(0, 50);
    let docSnippetCount = 0;
    for (const doc of docs) {
      try {
        const content = await this.scanner.readFile(doc.path);
        docSnippetCount += (content.match(/```(tsx|jsx|ts|js|html|vue|svelte)/g) ?? []).length;
      } catch {
        // ignore unreadable docs
      }
    }

    const storyCoverage =
      componentCount > 0 ? Math.min(100, Math.round((stories.length / componentCount) * 100)) : 0;

    return { storyCoverage, docSnippetCount, testFileCount: tests.length };
  }

  private scoreExampleDensity(
    examples: Awaited<ReturnType<AIReadinessAuditor['analyzeExamples']>>,
    componentCount: number,
    findings: Finding[]
  ): number {
    let score = 0;
    score += (examples.storyCoverage / 100) * 10;

    // One snippet per two components is a healthy target.
    const snippetTarget = Math.max(1, componentCount / 2);
    score += Math.min(1, examples.docSnippetCount / snippetTarget) * 5;

    const testTarget = Math.max(1, componentCount / 2);
    score += Math.min(1, examples.testFileCount / testTarget) * 5;

    if (examples.storyCoverage < 50 && componentCount > 0) {
      findings.push({
        id: 'air-story-coverage',
        type: 'warning',
        message: `Story coverage is ${examples.storyCoverage}% — stories are the usage examples AI assistants pattern-match from`,
        severity: 'medium',
        suggestion: 'Add stories for uncovered components, including variant and edge-case examples',
      });
    }

    return Math.min(20, Math.round(score));
  }

  private scoreGuardrails(artifacts: ArtifactChecklist, findings: Finding[]): number {
    let score = 0;

    if (artifacts.eslintConfig) score += 3;
    if (artifacts.sharedLintConfig) {
      score += 3;
      findings.push({
        id: 'air-shared-lint',
        type: 'success',
        message:
          'Shareable lint configuration detected — consumers (human or AI) inherit design system rules',
        severity: 'low',
      });
    }

    if (artifacts.strictTypescript) {
      score += 4;
    } else {
      findings.push({
        id: 'air-strict-ts',
        type: 'warning',
        message:
          'TypeScript strict mode is not enabled — loose types let AI-generated misuse compile silently',
        severity: 'medium',
        suggestion: 'Enable "strict": true in tsconfig.json',
      });
    }

    if (artifacts.changelogMachinery) {
      score += 3;
    } else {
      findings.push({
        id: 'air-changelog',
        type: 'info',
        message:
          'No CHANGELOG.md or changesets found — assistants cannot tell which API version their training or context matches',
        severity: 'low',
        suggestion: 'Adopt changesets (or keep a CHANGELOG.md) so API changes are machine-parseable',
      });
    }

    if (artifacts.versionedPackage) score += 2;

    return Math.min(15, score);
  }
}
