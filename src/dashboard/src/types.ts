/**
 * Single source of truth for the dashboard's data contract: the real engine
 * types. Nothing here is redeclared — the dashboard renders exactly what the
 * audit engine produces.
 */
export type {
  AuditResult,
  AuditMetadata,
  CategoryResult,
  Finding,
  Recommendation,
  JudgeResult,
  JudgeIssue,
  ExternalDesignSystemInfo,
  TokenCoverageMetrics,
  ComponentTokenUsage,
  HardcodedValue,
  TokenUsageInfo,
  TokenRedundancy,
} from '../../types/index.js';
