declare module '@types' {
  export interface AuditResult {
    timestamp: string;
    projectPath: string;
    overallScore: number;
    overallGrade: string;
    categories: CategoryResult[];
    recommendations: Recommendation[];
    metadata: AuditMetadata;
    aiInsights?: AIInsights;
  }

  export interface AuditMetadata {
    duration: number;
    filesScanned: number;
    toolsDetected: string[];
    frameworksDetected: string[];
    errors: string[];
    outputPath?: string;
  }

  export interface CategoryResult {
    name: string;
    score: number;
    grade: string;
    weight: number;
    findings?: Finding[];
    recommendations?: Recommendation[];
    metadata?: Record<string, any>;
    description?: string;
  }

  export interface Finding {
    type: 'success' | 'warning' | 'error' | 'info';
    message: string;
    details?: string;
    file?: string;
    line?: number;
  }

  export interface Recommendation {
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    effort: string;
    category?: string;
    impact?: string;
  }

  export interface AIInsights {
    summary?: string;
    patterns?: string[];
    suggestions?: Array<{
      category: string;
      title: string;
      description: string;
    }>;
  }

  export interface AuditConfig {
    projectPath: string;
    modules: {
      components: boolean;
      tokens: boolean;
      documentation: boolean;
      governance: boolean;
      tooling: boolean;
      performance: boolean;
      accessibility: boolean;
    };
    ai?: {
      enabled: boolean;
      apiKey?: string;
      model?: string;
    };
    dashboard: {
      port: number;
      autoOpen: boolean;
    };
  }
}