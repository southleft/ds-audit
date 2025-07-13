export interface AuditConfig {
  projectPath: string;
  outputPath: string;
  includePatterns: string[];
  excludePatterns: string[];
  modules: {
    components: boolean;
    tokens: boolean;
    documentation: boolean;
    governance: boolean;
    tooling: boolean;
    performance: boolean;
    accessibility: boolean;
  };
  ai: {
    enabled: boolean;
    apiKey?: string;
    model?: string;
  };
  dashboard: {
    enabled: boolean;
    port: number;
    autoOpen: boolean;
  };
}

export interface AuditResult {
  timestamp: string;
  projectPath: string;
  overallScore: number;
  overallGrade: string;
  categories: CategoryResult[];
  recommendations: Recommendation[];
  metadata: AuditMetadata;
  aiInsights?: {
    summary: string;
    strengths: string[];
    improvements: string[];
    sources?: boolean;
  };
}

export interface CategoryResult {
  id: string;
  name: string;
  score: number;
  grade: string;
  weight: number;
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
}

export interface DocumentationInfo {
  type: 'component' | 'system' | 'api' | 'guide';
  path: string;
  title: string;
  completeness: number;
  lastUpdated?: Date;
  missingElements: string[];
}