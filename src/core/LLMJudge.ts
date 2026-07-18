import Anthropic from '@anthropic-ai/sdk';
import type { AuditConfig, AuditResult, CategoryResult, JudgeResult } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';
import { Logger } from '../utils/Logger.js';

/**
 * Rubric-based LLM judge for the qualitative dimensions static analysis
 * cannot measure: documentation quality, component API design, and token
 * architecture semantics.
 *
 * Honesty contract:
 * - The judge NEVER fabricates output. A failed call means the category
 *   simply has no judge result and the deterministic score stands alone.
 * - Every judgement records the model used and the files it was shown, so
 *   results are auditable.
 * - Structured outputs (output_config.format) guarantee schema-valid JSON —
 *   no regex parsing of prose, no invalid enum values leaking downstream.
 */

const DEFAULT_JUDGE_MODEL = 'claude-opus-4-8';

/** Categories the judge reviews, with explicit scoring rubrics. An optional
 * `instructions` block frames the judge's role for categories that need a
 * specific evaluation protocol (e.g. the blind consumption test). */
const RUBRICS: Record<string, { focus: string; criteria: string[]; instructions?: string }> = {
  documentation: {
    focus: 'documentation quality for consumers and contributors of this design system',
    criteria: [
      'README quality (0-25): states purpose, installation, and real usage examples a new consumer could follow',
      'Component documentation depth (0-25): components are documented with props, usage guidance, and dos/don\'ts — not just names',
      'Governance (0-25): contribution process, changelog/versioning discipline, and decision records exist and are current',
      'Clarity and accuracy (0-25): docs are well-organized, current with the code shown, and free of placeholder or contradictory content',
    ],
  },
  components: {
    focus: 'component implementation and API design quality',
    criteria: [
      'API consistency (0-25): prop naming, event handler conventions, and patterns are consistent across the sampled components',
      'Type safety (0-25): props are precisely typed (no any/loose objects), variants are constrained unions, required vs optional is deliberate',
      'Composition and theming (0-25): components consume design tokens/theme values rather than hardcoding, and compose rather than duplicate',
      'Implementation quality (0-25): readable, sensible state handling, forwarded refs/spread props where appropriate, no obvious defects',
    ],
  },
  tokens: {
    focus: 'design token architecture and semantics',
    criteria: [
      'Naming semantics (0-25): token names follow a coherent hierarchy (global → semantic → component) and communicate intent, not just values',
      'Scale completeness (0-25): color, spacing, and typography scales are complete and consistent (no ad-hoc gaps)',
      'Theming architecture (0-25): multi-theme/mode support is structural (aliases/semantic layers), not copy-pasted values',
      'Format consistency (0-25): consistent format and reference/alias usage across token files',
    ],
  },
  'ai-readiness': {
    focus:
      'how reliably an AI coding assistant could consume this design system correctly from its public artifacts alone (the blind consumption test)',
    criteria: [
      'Usage inferability (0-40): for each sampled component, attempt to write a typical, correct usage from ONLY the public contract shown (prop types, JSDoc, stories, docs). Score high only when nothing had to be guessed; deduct for every prop name, valid value, or import path you had to guess',
      'Contract precision (0-20): prop contracts are self-describing — constrained unions instead of open strings, JSDoc on non-obvious props, discoverable defaults',
      'Agent guidance quality (0-25): agent instruction files (CLAUDE.md/AGENTS.md/.cursorrules/llms.txt) give accurate, concrete consumption guidance (import paths, conventions, token rules, common mistakes) rather than boilerplate; score 0 when none exist',
      'Example quality (0-15): stories and doc snippets demonstrate realistic usage including variants and edge cases an assistant could pattern-match',
    ],
    instructions:
      'Simulate an AI coding assistant that has NEVER seen this library and cannot read component implementations — only the public artifacts provided. ' +
      'For each sampled component, first write (mentally) a typical usage, then assess how much you had to guess. ' +
      'Report every prop, value, or import path you had to guess as an issue — those are exactly what real assistants will hallucinate.',
  },
};

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    score: {
      type: 'integer',
      description: 'Total rubric score 0-100, the sum of the four criteria scores',
    },
    confidence: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
      description:
        'How adequate the provided evidence was for this judgement. Use "low" when the sample is too thin to judge fairly.',
    },
    summary: {
      type: 'string',
      description: 'Two to four sentences summarizing the judgement, referencing specific evidence',
    },
    strengths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete strengths observed in the evidence, with file references where possible',
    },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          description: { type: 'string' },
          file: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['severity', 'description'],
        additionalProperties: false,
      },
      description: 'Specific issues observed in the evidence. Only report what the evidence shows.',
    },
  },
  required: ['score', 'confidence', 'summary', 'strengths', 'issues'],
  additionalProperties: false,
} as const;

const INSIGHTS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'strengths', 'improvements'],
  additionalProperties: false,
} as const;

interface Evidence {
  files: { path: string; content: string }[];
  context?: string;
}

export class LLMJudge {
  private client: Anthropic;
  private model: string;
  private scanner: FileScanner;
  private logger: Logger;

  constructor(config: AuditConfig) {
    if (!config.ai.apiKey) {
      throw new Error('LLMJudge requires an API key');
    }
    this.client = new Anthropic({ apiKey: config.ai.apiKey });
    this.model = config.ai.model || DEFAULT_JUDGE_MODEL;
    this.scanner = new FileScanner(config);
    this.logger = new Logger();
  }

  /**
   * Judge every judgeable category present in the results. Categories whose
   * judge call fails are simply absent from the returned map.
   */
  async judgeCategories(
    categories: CategoryResult[],
    onCategoryJudged?: (categoryId: string) => void
  ): Promise<Map<string, JudgeResult>> {
    const results = new Map<string, JudgeResult>();

    for (const category of categories) {
      if (!RUBRICS[category.id]) continue;

      try {
        const evidence = await this.gatherEvidence(category);
        if (evidence.files.length === 0) {
          this.logger.warn(`LLM judge: no evidence files found for ${category.id}; skipping`);
          continue;
        }

        const judgement = await this.judgeCategory(category, evidence);
        results.set(category.id, judgement);
        onCategoryJudged?.(category.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`LLM judge failed for ${category.id}: ${message}`);
        // Authentication and quota problems will fail every category the
        // same way — stop early instead of burning three identical failures.
        if (
          error instanceof Anthropic.AuthenticationError ||
          error instanceof Anthropic.PermissionDeniedError
        ) {
          throw error;
        }
      }
    }

    return results;
  }

  private async judgeCategory(
    category: CategoryResult,
    evidence: Evidence
  ): Promise<JudgeResult> {
    const rubric = RUBRICS[category.id];

    const evidenceBlocks = evidence.files
      .map(f => `<file path="${f.path}">\n${f.content}\n</file>`)
      .join('\n\n');

    const prompt = [
      `Judge the ${rubric.focus} of this design system against the rubric below.`,
      ``,
      ...(rubric.instructions ? [rubric.instructions, ``] : []),
      `Rubric (score each criterion, total 0-100):`,
      ...rubric.criteria.map(c => `- ${c}`),
      ``,
      `Rules:`,
      `- Judge ONLY the evidence provided. Do not assume files or features you were not shown exist or are missing beyond this sample.`,
      `- Cite specific files or excerpts for every strength and issue.`,
      `- Score strictly: 90+ means genuinely exemplary among professional design systems.`,
      `- If the evidence sample is too thin to judge a criterion fairly, say so and report "low" confidence rather than guessing.`,
      evidence.context ? `\nStatic analysis context (already measured deterministically — do not re-score it, use it only as background):\n${evidence.context}` : '',
      ``,
      `Evidence:`,
      ``,
      evidenceBlocks,
    ].join('\n');

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system:
        'You are a principal design systems engineer performing a rigorous, evidence-based audit. ' +
        'You are known for calibrated, defensible scores — never inflated, never punitive without evidence.',
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: { type: 'json_schema', schema: JUDGE_SCHEMA } },
    });

    const text = response.content.find(block => block.type === 'text');
    if (!text || text.type !== 'text') {
      throw new Error('Judge response contained no output');
    }

    const parsed = JSON.parse(text.text) as {
      score: number;
      confidence: 'low' | 'medium' | 'high';
      summary: string;
      strengths: string[];
      issues: JudgeResult['issues'];
    };

    return {
      score: Math.min(Math.max(Math.round(parsed.score), 0), 100),
      confidence: parsed.confidence,
      summary: parsed.summary,
      strengths: parsed.strengths,
      issues: parsed.issues,
      model: this.model,
      evidenceFiles: evidence.files.map(f => f.path),
    };
  }

  /**
   * Overall audit insights derived from the final category results. Returns
   * null on any failure — never canned text.
   */
  async generateInsights(
    categories: CategoryResult[],
    overallScore: number
  ): Promise<AuditResult['aiInsights'] | null> {
    try {
      const summary = categories
        .map(c => {
          const topFindings = c.findings
            .filter(f => f.severity === 'critical' || f.severity === 'high')
            .slice(0, 5)
            .map(f => `  - [${f.severity}] ${f.message}`)
            .join('\n');
          return `${c.name}: ${c.score}/100 (${c.grade})${topFindings ? `\n${topFindings}` : ''}`;
        })
        .join('\n');

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        thinking: { type: 'adaptive' },
        system:
          'You are a principal design systems engineer summarizing an audit for the team that owns the system. ' +
          'Base every statement strictly on the audit data provided.',
        messages: [
          {
            role: 'user',
            content:
              `Overall score: ${overallScore}/100.\n\nCategory results:\n${summary}\n\n` +
              `Write a short executive summary, the 3-5 most significant strengths, and the 3-5 highest-leverage improvements. ` +
              `Reference only what appears in the audit data.`,
          },
        ],
        output_config: { format: { type: 'json_schema', schema: INSIGHTS_SCHEMA } },
      });

      const text = response.content.find(block => block.type === 'text');
      if (!text || text.type !== 'text') return null;
      return JSON.parse(text.text) as AuditResult['aiInsights'];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`AI insights generation failed: ${message}`);
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // Evidence gathering — deterministic sampling with hard size caps so
  // judge cost is bounded regardless of repo size.
  // ---------------------------------------------------------------------

  private async gatherEvidence(category: CategoryResult): Promise<Evidence> {
    switch (category.id) {
      case 'documentation':
        return this.gatherDocumentationEvidence();
      case 'components':
        return this.gatherComponentEvidence(category);
      case 'tokens':
        return this.gatherTokenEvidence(category);
      case 'ai-readiness':
        return this.gatherAIReadinessEvidence(category);
      default:
        return { files: [] };
    }
  }

  /**
   * Blind consumption bundle: for each sampled component, ONLY the public
   * surface an assistant would see — extracted prop contracts and JSDoc (not
   * the implementation), the component's stories, and any agent guidance
   * files. Implementation bodies are deliberately withheld so the judge
   * measures inferability, not code quality.
   */
  private async gatherAIReadinessEvidence(category: CategoryResult): Promise<Evidence> {
    const files: Evidence['files'] = [];

    // Agent guidance files, shown in full (capped) — their quality is scored.
    for (const path of ['CLAUDE.md', 'AGENTS.md', '.cursorrules', 'llms.txt']) {
      if (await this.scanner.fileExists(path)) {
        files.push({ path, content: await this.readCapped(path, 4000) });
      }
    }

    // Package identity is public surface — an assistant consuming the library
    // would know its name and exports map, so the blind test should too.
    const manifests = await this.scanner.scanFiles(['package.json', 'packages/*/package.json']);
    const manifestSummaries: string[] = [];
    for (const manifest of manifests.map(f => f.path).sort().slice(0, 4)) {
      try {
        const parsed = JSON.parse(await this.scanner.readFile(manifest)) as Record<string, unknown>;
        manifestSummaries.push(
          `${manifest}: ${JSON.stringify(
            { name: parsed.name, exports: parsed.exports, main: parsed.main, types: parsed.types },
            null,
            2
          )}`
        );
      } catch {
        // unparseable manifest — omit from evidence
      }
    }
    if (manifestSummaries.length > 0) {
      files.push({
        path: 'package manifests (public entry points)',
        content: manifestSummaries.join('\n\n').slice(0, 3000),
      });
    }

    const candidates = await this.scanner.scanFiles([
      'src/components/**/*.{tsx,jsx}',
      'components/**/*.{tsx,jsx}',
      'packages/*/src/**/*.{tsx,jsx}',
      '!**/*.test.*',
      '!**/*.spec.*',
      '!**/*.stories.*',
      '!**/index.*',
    ]);
    const sampled = this.sample(candidates.map(f => f.path), 3);

    for (const path of sampled) {
      const source = await this.scanner.readFile(path);
      const contract = this.extractPublicContract(source);
      files.push({
        path: `${path} (public contract only)`,
        content: contract || '[no exported props contract or JSDoc found in this file]',
      });

      // The component's story file, if any — public usage examples.
      const base = path.replace(/\.[jt]sx$/, '');
      const stories = await this.scanner.scanFiles([`${base}.stories.*`]);
      if (stories.length > 0) {
        files.push({
          path: stories[0].path,
          content: await this.readCapped(stories[0].path, 3000),
        });
      }
    }

    const artifacts = category.metrics.artifacts as Record<string, boolean> | undefined;
    const context = artifacts
      ? `Deterministic artifact checklist (already scored — background only): ${Object.entries(
          artifacts
        )
          .map(([k, v]) => `${k}=${v ? 'yes' : 'no'}`)
          .join(', ')}`
      : undefined;

    return { files, context };
  }

  /**
   * Extract the public surface of a component file: JSDoc blocks, exported
   * interface/type declarations, and export signatures — without function
   * bodies. A best-effort heuristic; anything not captured simply isn't
   * shown to the judge (erring toward showing less, never implementation).
   */
  private extractPublicContract(source: string): string {
    const parts: string[] = [];

    // Imports give legitimate public context (what the file re-exports/uses).
    const imports = source.match(/^import[^;]+;$/gm)?.slice(0, 10) ?? [];
    if (imports.length > 0) parts.push(imports.join('\n'));

    // Interface/type declarations named *Props, with any preceding JSDoc.
    const declPattern =
      /(\/\*\*[\s\S]*?\*\/\s*)?(?:export\s+)?(?:interface|type)\s+\w*Props\b[\s\S]*?(?=\n(?:export|const|function|interface|type|\/\*\*)|$)/g;
    for (const match of source.match(declPattern) ?? []) {
      parts.push(match.trim().slice(0, 2500));
    }

    // Export signatures (first line only — no bodies) with preceding JSDoc.
    const exportPattern =
      /(\/\*\*[\s\S]{0,600}?\*\/\s*)?export\s+(?:default\s+)?(?:const|function)\s+[A-Z]\w*[^\n]*/g;
    for (const match of source.match(exportPattern) ?? []) {
      parts.push(match.trim());
    }

    return parts.join('\n\n').slice(0, 5000);
  }

  private async gatherDocumentationEvidence(): Promise<Evidence> {
    const files: Evidence['files'] = [];

    for (const path of ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md']) {
      if (await this.scanner.fileExists(path)) {
        files.push({ path, content: await this.readCapped(path, 8000) });
      }
    }

    const docFiles = await this.scanner.scanFiles(['docs/**/*.md', 'documentation/**/*.md']);
    for (const doc of this.sample(docFiles.map(f => f.path), 3)) {
      files.push({ path: doc, content: await this.readCapped(doc, 4000) });
    }

    return { files };
  }

  private async gatherComponentEvidence(category: CategoryResult): Promise<Evidence> {
    const candidates = await this.scanner.scanFiles([
      'src/components/**/*.{tsx,jsx,vue,svelte}',
      'components/**/*.{tsx,jsx,vue,svelte}',
      'packages/*/src/**/*.{tsx,jsx,vue,svelte}',
      'src/**/*.{tsx,jsx}',
      '!**/*.test.*',
      '!**/*.spec.*',
      '!**/*.stories.*',
    ]);

    const paths = this.sample(
      candidates.map(f => f.path).filter(p => !/(^|\/)(index|main|app)\.[jt]sx$/i.test(p)),
      5
    );

    const files: Evidence['files'] = [];
    for (const path of paths) {
      files.push({ path, content: await this.readCapped(path, 6000) });
    }

    const total = category.metrics.totalComponents;
    return {
      files,
      context: total !== undefined ? `Total components discovered by static analysis: ${total}. You are seeing a sample of ${files.length}.` : undefined,
    };
  }

  private async gatherTokenEvidence(category: CategoryResult): Promise<Evidence> {
    const candidates = await this.scanner.scanFiles([
      '**/tokens/**/*.{json,css,scss}',
      '**/*tokens*.{json,css,scss}',
      '**/theme*.{json,css,scss,ts,js}',
      '!**/*.min.*',
    ]);

    const files: Evidence['files'] = [];
    for (const path of this.sample(candidates.map(f => f.path), 4)) {
      files.push({ path, content: await this.readCapped(path, 6000) });
    }

    const contextParts: string[] = [];
    if (category.metrics.totalTokens !== undefined) {
      contextParts.push(`Total tokens found: ${category.metrics.totalTokens}`);
    }
    if (category.metrics.coveragePercentage !== undefined) {
      contextParts.push(`Measured usage coverage: ${category.metrics.coveragePercentage}%`);
    }

    return { files, context: contextParts.join('. ') || undefined };
  }

  /** Deterministic sample: sorted, then evenly spaced across the list so the
   * pick spans the codebase instead of clustering alphabetically. */
  private sample(paths: string[], count: number): string[] {
    const sorted = [...new Set(paths)].sort();
    if (sorted.length <= count) return sorted;
    const step = sorted.length / count;
    return Array.from({ length: count }, (_, i) => sorted[Math.floor(i * step)]);
  }

  private async readCapped(path: string, maxChars: number): Promise<string> {
    const content = await this.scanner.readFile(path);
    return content.length > maxChars
      ? `${content.slice(0, maxChars)}\n… [truncated at ${maxChars} chars]`
      : content;
  }
}
