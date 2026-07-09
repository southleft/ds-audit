import path from 'path';
import type { AuditConfig, CategoryResult, Finding, DocumentationInfo } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';

/**
 * Structural quality of one markdown document — measured properties, not
 * keyword bingo: enough prose, at least one code block, real headings.
 */
interface DocStructure {
  wordCount: number;
  codeBlocks: number;
  headings: number;
}

const README_MIN_WORDS = 100;

export class DocumentationAuditor {
  private config: AuditConfig;
  private scanner: FileScanner;

  constructor(config: AuditConfig) {
    this.config = config;
    this.scanner = new FileScanner(config);
  }

  async audit(): Promise<CategoryResult> {
    const findings: Finding[] = [];
    const documentation: DocumentationInfo[] = [];
    const seenPaths = new Set<string>();

    // README — the only document whose absence is critical.
    const readme = await this.checkReadme(findings, seenPaths);
    if (readme) documentation.push(readme);

    // Governance docs (CONTRIBUTING, CHANGELOG, versioning) — medium severity.
    const governance = await this.checkGovernance(findings, seenPaths, documentation);

    // Optional index/API docs — low-severity suggestions, never critical.
    await this.checkOptionalDocs(findings, seenPaths, documentation);

    // Component docs and the general docs corpus — counted by existence.
    // *.stories.* files are NOT documentation; Storybook is one boolean signal.
    const corpus = await this.scanDocsCorpus(seenPaths);
    documentation.push(...corpus);

    const hasStorybook = await this.detectStorybook();

    this.generateCorpusFindings(findings, corpus, hasStorybook);

    // Score formula (documented so the number is defensible). All points are
    // earned from measured properties; total attainable is exactly 100 and 0
    // is only reached with no documentation at all:
    //   README quality ........ 0-40  (40 * structural completeness%; 0 if absent)
    //   Docs corpus ........... 0-20  (min(pages / 10, 1) * 20 — md/mdx pages
    //                                  in docs/, documentation/, or beside components)
    //   Storybook ............. 0-10  (detected via dependencies or .storybook config)
    //   CONTRIBUTING.md ....... 0-10
    //   CHANGELOG.md .......... 0-10
    //   Versioning ............ 0-5   (package.json version field)
    //   Docs index / API doc .. 0-5   (docs/README.md or API.md exists)
    const readmePts = readme ? Math.round(40 * (readme.completeness / 100)) : 0;
    const corpusPts = Math.round(Math.min(corpus.length / 10, 1) * 20);
    const storybookPts = hasStorybook ? 10 : 0;
    const contributingPts = governance.hasContributing ? 10 : 0;
    const changelogPts = governance.hasChangelog ? 10 : 0;
    const versioningPts = governance.hasVersioning ? 5 : 0;
    const indexPts = governance.hasDocsIndex ? 5 : 0;

    const score =
      readmePts +
      corpusPts +
      storybookPts +
      contributingPts +
      changelogPts +
      versioningPts +
      indexPts;

    return {
      id: 'documentation',
      name: 'Documentation',
      score: Math.max(0, Math.min(100, score)),
      grade: '', // stamped by the engine
      weight: 0, // stamped by the engine
      findings,
      metrics: {
        filesScanned: documentation.length,
        totalDocs: documentation.length,
        docTypes: this.categorizeDocumentation(documentation),
        averageCompleteness: this.calculateAverageCompleteness(documentation),
        hasStorybook,
        hasVersioning: governance.hasVersioning,
        governanceDocsFound: governance.foundCount,
        scoreBreakdown: {
          readme: readmePts,
          docsCorpus: corpusPts,
          storybook: storybookPts,
          contributing: contributingPts,
          changelog: changelogPts,
          versioning: versioningPts,
          docsIndex: indexPts,
        },
      },
    };
  }

  private async checkReadme(
    findings: Finding[],
    seenPaths: Set<string>
  ): Promise<DocumentationInfo | null> {
    if (!(await this.scanner.fileExists('README.md'))) {
      findings.push({
        id: 'doc-readme-missing',
        type: 'error',
        message: 'No README.md — consumers have no entry point into the design system',
        severity: 'critical',
        suggestion:
          'Create a README with an overview, installation instructions, and a usage example',
      });
      return null;
    }

    seenPaths.add('README.md');
    const content = await this.scanner.readFile('README.md');
    const structure = this.measureStructure(content);
    const completeness = this.structuralCompleteness(structure);
    const missingElements = this.structuralGaps(structure);

    if (completeness >= 80) {
      findings.push({
        id: 'doc-readme-good',
        type: 'success',
        message: `README.md is structurally solid (${structure.wordCount} words, ${structure.codeBlocks} code block(s), ${structure.headings} heading(s))`,
        severity: 'low',
        path: 'README.md',
      });
    } else {
      findings.push({
        id: 'doc-readme-thin',
        type: 'warning',
        message: `README.md is thin (${completeness}% structural completeness)`,
        severity: 'medium',
        path: 'README.md',
        suggestion: `Improve the README: ${missingElements.join('; ')}`,
      });
    }

    return {
      type: 'system',
      path: 'README.md',
      title: this.extractTitle(content) || 'README',
      completeness,
      missingElements,
    };
  }

  private async checkGovernance(
    findings: Finding[],
    seenPaths: Set<string>,
    documentation: DocumentationInfo[]
  ): Promise<{
    hasContributing: boolean;
    hasChangelog: boolean;
    hasVersioning: boolean;
    hasDocsIndex: boolean;
    foundCount: number;
  }> {
    let foundCount = 0;

    const checkFile = async (
      file: string,
      label: string,
      suggestion: string
    ): Promise<boolean> => {
      if (await this.scanner.fileExists(file)) {
        foundCount++;
        seenPaths.add(file);
        const content = await this.scanner.readFile(file);
        const structure = this.measureStructure(content);
        documentation.push({
          type: 'guide',
          path: file,
          title: this.extractTitle(content) || label,
          completeness: this.structuralCompleteness(structure),
          missingElements: [],
        });
        findings.push({
          id: `gov-${file}-present`,
          type: 'success',
          message: `${label} found`,
          severity: 'low',
          path: file,
        });
        return true;
      }
      findings.push({
        id: `gov-${file}-missing`,
        type: 'warning',
        message: `${label} is missing`,
        severity: 'medium',
        suggestion,
      });
      return false;
    };

    const hasContributing = await checkFile(
      'CONTRIBUTING.md',
      'Contributing guide',
      'Add CONTRIBUTING.md so teams know how to propose and land changes to the design system'
    );
    const hasChangelog = await checkFile(
      'CHANGELOG.md',
      'Changelog',
      'Add CHANGELOG.md (or automate it with changesets/semantic-release) so consumers can track breaking changes'
    );

    // Versioning: a real version field in package.json.
    let hasVersioning = false;
    try {
      const pkg = JSON.parse(await this.scanner.readFile('package.json'));
      hasVersioning = typeof pkg.version === 'string' && pkg.version.length > 0;
    } catch {
      // no package.json
    }
    if (hasVersioning) {
      findings.push({
        id: 'gov-versioning',
        type: 'success',
        message: 'Package versioning in place (package.json version field)',
        severity: 'low',
      });
    }

    // Optional extras: reported as successes when present, never penalized.
    const extras = [
      { file: 'CODE_OF_CONDUCT.md', name: 'Code of Conduct' },
      { file: '.github/PULL_REQUEST_TEMPLATE.md', name: 'PR Template' },
      { file: '.github/ISSUE_TEMPLATE', name: 'Issue Templates' },
    ];
    for (const { file, name } of extras) {
      if (await this.scanner.fileExists(file)) {
        foundCount++;
        findings.push({
          id: `gov-${file}`,
          type: 'success',
          message: `${name} found`,
          severity: 'low',
        });
      }
    }

    const hasDocsIndex =
      (await this.scanner.fileExists('docs/README.md')) ||
      (await this.scanner.fileExists('API.md'));

    return { hasContributing, hasChangelog, hasVersioning, hasDocsIndex, foundCount };
  }

  /** docs/README.md and API.md are nice-to-haves — low severity, never critical. */
  private async checkOptionalDocs(
    findings: Finding[],
    seenPaths: Set<string>,
    documentation: DocumentationInfo[]
  ): Promise<void> {
    const optional = [
      {
        file: 'docs/README.md',
        type: 'system' as const,
        title: 'Documentation Index',
        suggestion: 'A docs/README.md index helps readers navigate longer documentation sets',
      },
      {
        file: 'API.md',
        type: 'api' as const,
        title: 'API Documentation',
        suggestion:
          'Consider an API reference (API.md or generated typedoc) if the component API surface is large',
      },
    ];

    for (const { file, type, title, suggestion } of optional) {
      if (await this.scanner.fileExists(file)) {
        seenPaths.add(file);
        const content = await this.scanner.readFile(file);
        const structure = this.measureStructure(content);
        documentation.push({
          type,
          path: file,
          title: this.extractTitle(content) || title,
          completeness: this.structuralCompleteness(structure),
          missingElements: this.structuralGaps(structure),
        });
      } else {
        findings.push({
          id: `doc-${file}-missing`,
          type: 'info',
          message: `${title} (${file}) not found`,
          severity: 'low',
          suggestion,
        });
      }
    }
  }

  /**
   * The documentation corpus: markdown/MDX pages in docs directories or beside
   * components. Counted by existence with structural completeness measured per
   * page. Story files are explicitly excluded — they are code, not docs.
   */
  private async scanDocsCorpus(seenPaths: Set<string>): Promise<DocumentationInfo[]> {
    const docs: DocumentationInfo[] = [];

    const files = await this.scanner.scanFiles([
      'docs/**/*.{md,mdx}',
      'documentation/**/*.{md,mdx}',
      '**/components/**/*.{md,mdx}',
      '**/src/components/**/*.{md,mdx}',
      '*.md',
      '!**/node_modules/**',
      '!**/dist/**',
      '!**/build/**',
      '!**/*.stories.{md,mdx}',
      '!**/CHANGELOG.md',
    ]);

    for (const file of files) {
      if (seenPaths.has(file.path)) continue; // README/governance already counted
      seenPaths.add(file.path);

      let content: string;
      try {
        content = await this.scanner.readFile(file.path);
      } catch {
        continue;
      }

      const structure = this.measureStructure(content);
      const isComponentDoc = /(^|\/)components\//.test(file.path);

      docs.push({
        type: isComponentDoc ? 'component' : this.detectDocumentationType(file.path),
        path: file.path,
        title: this.extractTitle(content) || path.basename(file.path, path.extname(file.path)),
        completeness: this.structuralCompleteness(structure),
        missingElements: this.structuralGaps(structure),
      });
    }

    return docs;
  }

  private async detectStorybook(): Promise<boolean> {
    const projectInfo = await this.scanner.detectProjectInfo();
    if (projectInfo.hasStorybook) return true;
    return this.scanner.fileExists('.storybook');
  }

  private detectDocumentationType(filePath: string): DocumentationInfo['type'] {
    const lower = filePath.toLowerCase();
    if (lower.includes('component')) return 'component';
    if (lower.includes('api')) return 'api';
    if (lower.includes('guide') || lower.includes('tutorial')) return 'guide';
    return 'system';
  }

  /** Measured structural properties — no keyword matching. */
  private measureStructure(content: string): DocStructure {
    // Strip fenced code blocks before counting words so a code dump doesn't
    // masquerade as prose.
    const codeBlocks = (content.match(/```/g) || []).length;
    const withoutCode = content.replace(/```[\s\S]*?```/g, ' ');
    const wordCount = withoutCode.split(/\s+/).filter(w => /\w/.test(w)).length;
    const headings = (content.match(/^#{1,6}\s+\S/gm) || []).length;

    return { wordCount, codeBlocks: Math.floor(codeBlocks / 2), headings };
  }

  /**
   * Structural completeness (0-100):
   *   prose depth ..... 40 (full at >=100 words, half at >=30)
   *   code examples ... 30 (at least one fenced code block)
   *   organization .... 30 (full at >=2 headings, half at 1)
   */
  private structuralCompleteness(s: DocStructure): number {
    let pts = 0;
    if (s.wordCount >= README_MIN_WORDS) pts += 40;
    else if (s.wordCount >= 30) pts += 20;
    if (s.codeBlocks >= 1) pts += 30;
    if (s.headings >= 2) pts += 30;
    else if (s.headings === 1) pts += 15;
    return pts;
  }

  private structuralGaps(s: DocStructure): string[] {
    const gaps: string[] = [];
    if (s.wordCount < README_MIN_WORDS) {
      gaps.push(`add more prose (${s.wordCount} words, aim for ${README_MIN_WORDS}+)`);
    }
    if (s.codeBlocks === 0) gaps.push('add at least one code example');
    if (s.headings < 2) gaps.push('organize content under headings');
    return gaps;
  }

  private extractTitle(content: string): string | null {
    const titleMatch = content.match(/^#\s+(.+)$/m);
    return titleMatch ? titleMatch[1].trim() : null;
  }

  private generateCorpusFindings(
    findings: Finding[],
    corpus: DocumentationInfo[],
    hasStorybook: boolean
  ): void {
    if (hasStorybook) {
      findings.push({
        id: 'doc-storybook',
        type: 'success',
        message: 'Storybook detected (interactive component documentation)',
        severity: 'low',
      });
    } else {
      findings.push({
        id: 'doc-no-storybook',
        type: 'info',
        message: 'Storybook not detected',
        severity: 'low',
        suggestion: 'Consider Storybook for interactive component documentation',
      });
    }

    const componentDocs = corpus.filter(d => d.type === 'component');
    if (componentDocs.length === 0 && !hasStorybook) {
      findings.push({
        id: 'doc-no-component-docs',
        type: 'warning',
        message: 'No per-component documentation found (no markdown near components, no Storybook)',
        severity: 'high',
        suggestion:
          'Document each component with props, usage examples, and guidelines — Storybook or markdown pages both work',
      });
    } else if (componentDocs.length > 0) {
      findings.push({
        id: 'doc-component-docs',
        type: 'success',
        message: `${componentDocs.length} component documentation page(s) found`,
        severity: 'low',
      });
    }

    if (corpus.length > 0) {
      const avg = this.calculateAverageCompleteness(corpus);
      if (avg >= 70) {
        findings.push({
          id: 'doc-corpus-quality',
          type: 'success',
          message: `${corpus.length} documentation page(s) with ${avg}% average structural completeness`,
          severity: 'low',
        });
      } else {
        findings.push({
          id: 'doc-corpus-thin',
          type: 'warning',
          message: `${corpus.length} documentation page(s) found, but average structural completeness is ${avg}% — many pages lack prose, examples, or headings`,
          severity: 'medium',
          suggestion: 'Flesh out thin pages with usage prose, code examples, and section headings',
        });
      }
    }
  }

  private categorizeDocumentation(docs: DocumentationInfo[]): Record<string, number> {
    const categories: Record<string, number> = {
      component: 0,
      system: 0,
      api: 0,
      guide: 0,
    };
    docs.forEach(doc => {
      categories[doc.type]++;
    });
    return categories;
  }

  private calculateAverageCompleteness(docs: DocumentationInfo[]): number {
    if (docs.length === 0) return 0;
    const total = docs.reduce((sum, doc) => sum + doc.completeness, 0);
    return Math.round(total / docs.length);
  }
}
