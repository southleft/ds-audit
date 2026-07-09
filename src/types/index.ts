export interface AuditConfig {
  projectPath: string;
  outputPath: string;
  includePatterns: string[];
  excludePatterns: string[];
  modules: {
    components: boolean;
    tokens: boolean;
    documentation: boolean;  // Now includes governance checks
    // governance removed - merged into documentation
    tooling: boolean;
    performance: boolean;
    accessibility: boolean;
  };
  ai: {
    enabled: boolean;
    apiKey?: string;
    model?: string;
    /** Weight (0-1) given to the LLM judge score when blending with the
     * deterministic score for judged categories. Default 0.3. */
    judgeWeight?: number;
  };
  dashboard: {
    enabled: boolean;
    port: number;
    autoOpen: boolean;
  };
}

export interface ExternalDesignSystemInfo {
  detected: boolean;
  systems: Array<{
    name: string;
    packageName: string;
    version?: string;
    type: 'component-library' | 'utility' | 'css-framework';
    hasThemeSupport: boolean;
    documentation: string;
  }>;
  mode: 'pure-local' | 'hybrid' | 'pure-external';
  localComponentCount: number;
  externalComponentCount: number;
  themeCustomizations: Array<{
    type: string;
    file: string;
    description: string;
  }>;
  scoringAdjustment: {
    componentWeight: number;
    tokenWeight: number;
    reason: string;
  };
}

export interface AuditResult {
  timestamp: string;
  projectPath: string;
  overallScore: number;
  overallGrade: string;
  /** True when one or more enabled categories failed to run. The overall
   * score covers only the categories that completed. */
  partial?: boolean;
  categories: CategoryResult[];
  recommendations: Recommendation[];
  metadata: AuditMetadata;
  externalDesignSystem?: ExternalDesignSystemInfo;
  aiInsights?: {
    summary: string;
    strengths: string[];
    improvements: string[];
  };
}

/** Output of the LLM judge for a single category. Only present when AI is
 * enabled and the category is judgeable. Never fabricated: if the judge call
 * fails, the field is absent and the deterministic score stands alone. */
export interface JudgeResult {
  /** Rubric-based score 0-100 assigned by the model. */
  score: number;
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  strengths: string[];
  issues: JudgeIssue[];
  /** Model ID that produced this judgement, for traceability. */
  model: string;
  /** Files/excerpts the judge was shown, so the result is auditable. */
  evidenceFiles: string[];
}

export interface JudgeIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  file?: string;
  suggestion?: string;
}

export interface CategoryResult {
  id: string;
  name: string;
  /** Final category score. When `judge` is present this is the labeled blend
   * of `deterministicScore` and `judge.score`; otherwise purely deterministic. */
  score: number;
  grade: string;
  /** Effective weight used in the overall score. Stamped by the engine from
   * the single scoring table — auditors do not control this. */
  weight: number;
  /** The static-analysis score before any judge blending. */
  deterministicScore?: number;
  judge?: JudgeResult;
  findings: Finding[];
  metrics: Record<string, unknown>;
  scannedPaths?: string[];
  detailedPaths?: {
    pattern: string;
    matches: string[];
    fileTypes: Record<string, number>;
  }[];
}

export interface Finding {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  path?: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  effort: 'quick-win' | 'medium-lift' | 'heavy-lift';
  impact: 'low' | 'medium' | 'high';
  category: string;
  implementation?: string;
}

export interface AuditMetadata {
  duration: number;
  filesScanned: number;
  toolsDetected: string[];
  frameworksDetected: string[];
  errors: string[];
  /** Category IDs that were enabled but crashed. Surfaced prominently in
   * reports; the overall score excludes them and is marked partial. */
  failedCategories?: { id: string; error: string }[];
  outputPath?: string;
}

export interface ComponentInfo {
  name: string;
  path: string;
  type: 'atomic' | 'molecular' | 'organism' | 'template' | 'unknown';
  hasTests: boolean;
  hasStory: boolean;
  hasDocumentation: boolean;
  hasTypes: boolean;
  accessibility: AccessibilityInfo;
  props: PropInfo[];
}

export interface AccessibilityInfo {
  hasAriaLabels: boolean;
  hasFocusManagement: boolean;
  hasKeyboardSupport: boolean;
  violations: string[];
}

export interface PropInfo {
  name: string;
  type: string;
  required: boolean;
  hasDefault: boolean;
  description?: string;
}

export interface TokenInfo {
  name: string;
  value: string;
  type: 'color' | 'spacing' | 'typography' | 'shadow' | 'border' | 'other';
  category: 'global' | 'semantic' | 'component';
  path: string;
  usage: number;
  referencedBy?: string[]; // Other tokens that reference this token
  aliasOf?: string; // If this token is an alias, what token it references
}

export interface TokenUsageInfo {
  tokenName: string;
  tokenValue: string;
  usageCount: number;
  files: Array<{
    path: string;
    line?: number;
    context?: string;
  }>;
}

export interface HardcodedValue {
  value: string;
  type: 'color' | 'spacing' | 'typography' | 'shadow' | 'border' | 'other';
  files: Array<{
    path: string;
    line?: number;
    context?: string;
  }>;
  matchedToken?: string;
  similarity?: number;
}

export interface TokenRedundancy {
  tokens: Array<{
    name: string;
    value: string;
  }>;
  type: 'color' | 'spacing' | 'typography' | 'shadow' | 'border' | 'other';
  similarity: number;
  suggestion?: string;
}

export interface TokenCoverageMetrics {
  totalTokens: number;
  usedTokens: number;
  unusedTokens: string[];
  coveragePercentage: number;
  byCategory: Record<string, {
    total: number;
    used: number;
    percentage: number;
    mostUsed: Array<{ name: string; count: number }>;
    leastUsed: Array<{ name: string; count: number }>;
  }>;
}

export interface ComponentTokenUsage {
  componentPath: string;
  componentName: string;
  tokensUsed: string[];
  hardcodedValues: number;
  coverageScore: number;
  needsAttention?: boolean;
  attentionReasons?: string[];
}

export interface DocumentationInfo {
  type: 'component' | 'system' | 'api' | 'guide';
  path: string;
  title: string;
  completeness: number;
  lastUpdated?: Date;
  missingElements: string[];
}