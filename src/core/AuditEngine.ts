import { EventEmitter } from 'events';
import type {
  AuditConfig,
  AuditResult,
  CategoryResult,
  ExternalDesignSystemInfo,
  Finding,
  JudgeResult,
} from '../types/index.js';
import { ComponentAuditor } from '../modules/ComponentAuditor.js';
import { TokenAuditor } from '../modules/TokenAuditor.js';
import { DocumentationAuditor } from '../modules/DocumentationAuditor.js';
import { ToolingAuditor } from '../modules/ToolingAuditor.js';
import { PerformanceAuditor } from '../modules/PerformanceAuditor.js';
import { AccessibilityAuditor } from '../modules/AccessibilityAuditor.js';
import { ScoringService } from './ScoringService.js';
import { LLMJudge } from './LLMJudge.js';
import { Logger } from '../utils/Logger.js';
import { FileScanner } from '../utils/FileScanner.js';
import { ExternalDSDetector } from '../utils/ExternalDSDetector.js';

interface Auditor {
  audit(): Promise<CategoryResult>;
}

export class AuditEngine extends EventEmitter {
  private config: AuditConfig;
  private logger: Logger;
  private auditors: Map<string, Auditor>;
  private scoringService: ScoringService;
  private judge?: LLMJudge;

  constructor(config: AuditConfig) {
    super();
    this.config = config;
    this.logger = new Logger();
    this.scoringService = new ScoringService();

    if (config.ai.enabled && config.ai.apiKey) {
      this.judge = new LLMJudge(config);
    }

    this.auditors = new Map();
    this.initializeAuditors();
  }

  private initializeAuditors(): void {
    const { modules } = this.config;

    if (modules.components) {
      this.auditors.set('components', new ComponentAuditor(this.config));
    }
    if (modules.tokens) {
      this.auditors.set('tokens', new TokenAuditor(this.config));
    }
    if (modules.documentation) {
      this.auditors.set('documentation', new DocumentationAuditor(this.config));
    }
    if (modules.tooling) {
      this.auditors.set('tooling', new ToolingAuditor(this.config));
    }
    if (modules.performance) {
      this.auditors.set('performance', new PerformanceAuditor(this.config));
    }
    if (modules.accessibility) {
      this.auditors.set('accessibility', new AccessibilityAuditor(this.config));
    }
  }

  async run(): Promise<AuditResult> {
    const startTime = Date.now();
    this.emit('audit:start');
    this.logger.info('Starting design system audit...');

    const categoryResults: CategoryResult[] = [];
    const errors: string[] = [];
    const failedCategories: { id: string; error: string }[] = [];

    for (const [categoryId, auditor] of this.auditors) {
      try {
        this.emit('category:start', categoryId);
        this.logger.info(`Auditing ${categoryId}...`);

        const result = await auditor.audit();
        categoryResults.push(result);

        this.emit('category:complete', categoryId, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Error auditing ${categoryId}: ${message}`);
        errors.push(`Error auditing ${categoryId}: ${message}`);
        failedCategories.push({ id: categoryId, error: message });
        this.emit('category:error', categoryId, error);
      }
    }

    // Detect external design systems (adjusts weighting for e.g. Mantine/MUI-based systems)
    const externalDSDetector = new ExternalDSDetector(this.config.projectPath);
    const componentResult = categoryResults.find(c => c.id === 'components');
    const localComponentCount = (componentResult?.metrics?.totalComponents as number) || 0;
    const externalDSAnalysis = await externalDSDetector.analyze(localComponentCount);

    if (externalDSAnalysis.detected) {
      const systemNames = externalDSAnalysis.systems.map(s => s.name).join(', ');
      this.logger.info(
        `External design system detected: ${systemNames} (${externalDSAnalysis.mode} mode)`
      );
    }

    const dsAdjustment = externalDSAnalysis.detected
      ? externalDSAnalysis.scoringAdjustment
      : undefined;

    // Stamp effective weights and deterministic scores from the single
    // scoring table. Whatever weight an auditor may have set is overwritten.
    const effectiveWeights = this.scoringService.getEffectiveWeights(dsAdjustment);
    for (const category of categoryResults) {
      category.weight = effectiveWeights[category.id] ?? 0;
      category.deterministicScore = category.score;
      category.grade = this.scoringService.getGrade(category.score);
    }

    // LLM judge pass: rubric-based qualitative review, blended into the
    // deterministic score with an explicit, bounded weight. Failures are
    // surfaced and never fabricated.
    if (this.judge) {
      this.emit('ai:start');
      try {
        const judgements = await this.judge.judgeCategories(categoryResults, judged => {
          this.emit('ai:category', judged);
        });

        for (const category of categoryResults) {
          const judgement = judgements.get(category.id);
          if (!judgement) continue;

          category.judge = judgement;
          category.score = this.scoringService.blendWithJudge(
            category.deterministicScore ?? category.score,
            judgement.score,
            judgement.confidence,
            this.config.ai.judgeWeight
          );
          category.grade = this.scoringService.getGrade(category.score);
          category.findings.push(...this.judgeIssuesToFindings(category.id, judgement));
        }
        this.emit('ai:complete');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`LLM judge failed — scores are deterministic only: ${message}`);
        errors.push(`LLM judge failed: ${message}`);
        this.emit('ai:error', error);
      }
    }

    const { score, grade } = this.scoringService.calculateOverallScore(
      categoryResults,
      dsAdjustment
    );

    const recommendations = this.scoringService.generateRecommendations(categoryResults);

    // AI insights come from the judge as well; absent (never canned) on failure.
    let aiInsights: AuditResult['aiInsights'];
    if (this.judge) {
      try {
        aiInsights = (await this.judge.generateInsights(categoryResults, score)) ?? undefined;
      } catch (error) {
        this.logger.warn('AI insights generation failed; omitting insights');
      }
    }

    const duration = Date.now() - startTime;

    const externalDesignSystem: ExternalDesignSystemInfo | undefined = externalDSAnalysis.detected
      ? {
          detected: true,
          systems: externalDSAnalysis.systems,
          mode: externalDSAnalysis.mode,
          localComponentCount: externalDSAnalysis.localComponentCount,
          externalComponentCount: externalDSAnalysis.externalComponentCount,
          themeCustomizations: externalDSAnalysis.themeCustomizations,
          scoringAdjustment: externalDSAnalysis.scoringAdjustment,
        }
      : undefined;

    const result: AuditResult = {
      timestamp: new Date().toISOString(),
      projectPath: this.config.projectPath,
      overallScore: score,
      overallGrade: grade,
      partial: failedCategories.length > 0 || undefined,
      categories: categoryResults,
      recommendations,
      metadata: {
        duration,
        filesScanned: this.getTotalFilesScanned(categoryResults),
        toolsDetected: this.getDetectedTools(categoryResults),
        frameworksDetected: await this.detectFrameworks(),
        errors,
        failedCategories: failedCategories.length > 0 ? failedCategories : undefined,
      },
      externalDesignSystem,
      aiInsights,
    };

    this.emit('audit:complete', result);
    this.logger.success(`Audit completed in ${duration}ms`);
    if (failedCategories.length > 0) {
      this.logger.warn(
        `Partial result: ${failedCategories.map(f => f.id).join(', ')} failed — ` +
          `the overall score covers only the categories that completed.`
      );
    }

    return result;
  }

  /** Judge issues become findings so they flow into reports and
   * recommendations. IDs are prefixed so UIs can label their origin. */
  private judgeIssuesToFindings(categoryId: string, judgement: JudgeResult): Finding[] {
    return judgement.issues.map((issue, index) => ({
      id: `judge-${categoryId}-${index + 1}`,
      type:
        issue.severity === 'critical' || issue.severity === 'high'
          ? ('error' as const)
          : issue.severity === 'medium'
            ? ('warning' as const)
            : ('info' as const),
      message: issue.description,
      severity: issue.severity,
      path: issue.file,
      suggestion: issue.suggestion,
    }));
  }

  private getTotalFilesScanned(results: CategoryResult[]): number {
    return results.reduce((total, category) => {
      const filesScanned = (category.metrics.filesScanned as number) || 0;
      return total + filesScanned;
    }, 0);
  }

  private getDetectedTools(results: CategoryResult[]): string[] {
    const tools = new Set<string>();
    results.forEach(category => {
      const detectedTools = (category.metrics.toolsDetected as string[]) || [];
      detectedTools.forEach(tool => tools.add(tool));
    });
    return Array.from(tools);
  }

  private async detectFrameworks(): Promise<string[]> {
    try {
      const scanner = new FileScanner(this.config);
      const info = await scanner.detectProjectInfo();
      const frameworks: string[] = [];
      if (info.type !== 'unknown') {
        frameworks.push(
          info.frameworkVersion ? `${info.type} ${info.frameworkVersion}` : info.type
        );
      }
      if (info.hasTypeScript) frameworks.push('typescript');
      if (info.hasStorybook) frameworks.push('storybook');
      return frameworks;
    } catch {
      return [];
    }
  }
}
