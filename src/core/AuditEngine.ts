import { EventEmitter } from 'events';
import type { AuditConfig, AuditResult, CategoryResult } from '../types/index.js';
import { ComponentAuditor } from '../modules/ComponentAuditor.js';
import { TokenAuditor } from '../modules/TokenAuditor.js';
import { DocumentationAuditor } from '../modules/DocumentationAuditor.js';
import { GovernanceAuditor } from '../modules/GovernanceAuditor.js';
import { ToolingAuditor } from '../modules/ToolingAuditor.js';
import { PerformanceAuditor } from '../modules/PerformanceAuditor.js';
import { AccessibilityAuditor } from '../modules/AccessibilityAuditor.js';
import { ScoringService } from './ScoringService.js';
import { AIService } from './AIService.js';
import { Logger } from '../utils/Logger.js';

export class AuditEngine extends EventEmitter {
  private config: AuditConfig;
  private logger: Logger;
  private auditors: Map<string, any>;
  private scoringService: ScoringService;
  private aiService?: AIService;

  constructor(config: AuditConfig) {
    super();
    this.config = config;
    this.logger = new Logger();
    this.scoringService = new ScoringService();
    
    if (config.ai.enabled && config.ai.apiKey) {
      this.aiService = new AIService(config.ai.apiKey, config.ai.model);
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
    if (modules.governance) {
      this.auditors.set('governance', new GovernanceAuditor(this.config));
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

    // Run each auditor
    for (const [categoryId, auditor] of this.auditors) {
      try {
        this.emit('category:start', categoryId);
        this.logger.info(`Auditing ${categoryId}...`);
        
        const result = await auditor.audit();
        categoryResults.push(result);
        
        this.emit('category:complete', categoryId, result);
      } catch (error) {
        const errorMessage = `Error auditing ${categoryId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        this.logger.error(errorMessage);
        errors.push(errorMessage);
        this.emit('category:error', categoryId, error);
      }
    }

    // Calculate overall score
    const { score, grade } = this.scoringService.calculateOverallScore(categoryResults);

    // Generate AI-powered recommendations if enabled
    let recommendations = this.scoringService.generateRecommendations(categoryResults);
    
    if (this.aiService) {
      try {
        this.emit('ai:start');
        const aiRecommendations = await this.aiService.enhanceRecommendations(
          categoryResults,
          recommendations
        );
        recommendations = aiRecommendations;
        this.emit('ai:complete');
      } catch (error) {
        this.logger.warn('AI enhancement failed, using basic recommendations');
        this.emit('ai:error', error);
      }
    }

    const duration = Date.now() - startTime;
    
    // Generate AI insights if enabled
    let aiInsights;
    if (this.config.ai?.enabled && this.config.ai.apiKey && this.aiService) {
      try {
        const insights = await this.aiService.generateInsights(categoryResults, score);
        aiInsights = insights;
      } catch (error) {
        this.logger.warn('Failed to generate AI insights');
      }
    }
    
    const result: AuditResult = {
      timestamp: new Date().toISOString(),
      projectPath: this.config.projectPath,
      overallScore: score,
      overallGrade: grade,
      categories: categoryResults,
      recommendations,
      metadata: {
        duration,
        filesScanned: this.getTotalFilesScanned(categoryResults),
        toolsDetected: this.getDetectedTools(categoryResults),
        frameworksDetected: this.getDetectedFrameworks(categoryResults),
        errors,
      },
      aiInsights,
    };

    this.emit('audit:complete', result);
    this.logger.success(`Audit completed in ${duration}ms`);
    
    return result;
  }

  private getTotalFilesScanned(results: CategoryResult[]): number {
    return results.reduce((total, category) => {
      const filesScanned = category.metrics.filesScanned as number || 0;
      return total + filesScanned;
    }, 0);
  }

  private getDetectedTools(results: CategoryResult[]): string[] {
    const tools = new Set<string>();
    results.forEach(category => {
      const detectedTools = category.metrics.toolsDetected as string[] || [];
      detectedTools.forEach(tool => tools.add(tool));
    });
    return Array.from(tools);
  }

  private getDetectedFrameworks(results: CategoryResult[]): string[] {
    const frameworks = new Set<string>();
    results.forEach(category => {
      const detectedFrameworks = category.metrics.frameworksDetected as string[] || [];
      detectedFrameworks.forEach(framework => frameworks.add(framework));
    });
    return Array.from(frameworks);
  }
}