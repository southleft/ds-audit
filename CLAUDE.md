# Claude Code Context for dsaudit

## Project Overview
CLI-based design system auditing tool ("Chrome Lighthouse for design systems") that evaluates the health, structure, and completeness of code-based design systems.

## Key Commands
- `npm run build` - Build the TypeScript project and dashboard
- `npm run dev` - Run in development mode
- `npm run lint` - Run ESLint
- `npm run typecheck` - Check TypeScript types
- `npm test` - Run tests

## CLI Commands
- `dsaudit init` - Interactive audit: prompts for modules and AI judge opt-in, writes `.dsaudit.json`, runs the audit
  - `--path <dir>` - Project directory (default: cwd)
  - `--no-interactive` - Use defaults; AI enabled only if ANTHROPIC_API_KEY is present
- `dsaudit run` - Non-interactive audit using `.dsaudit.json`
  - `--config <path>` - Custom config file path
  - `--output <dir>` - Output directory for reports
  - `--format <formats>` - Report formats: json,md (no html — the dashboard is the HTML experience)
  - `--dashboard` - Start dashboard after audit
  - `--quiet` - Minimal output for CI/CD
- `dsaudit config --show` - Pretty-print `.dsaudit.json` from cwd
- `dsaudit config --reset` - Write the default configuration

## Architecture
Deterministic auditors + optional LLM judge (`src/core/LLMJudge.ts`); single scoring table in `src/core/ScoringService.ts` (`CATEGORY_WEIGHTS`).

- **CLI Layer** (`src/cli/`) - Commands: init, run, config. Shared config defaults exported from `src/cli/commands/config.ts` (`createDefaultConfig`)
- **Core Layer** (`src/core/`) - `AuditEngine` orchestrates deterministic auditors; the optional LLM judge performs rubric-based review of judged categories (documentation, components, tokens), blended at a bounded weight (`ai.judgeWeight`, default 0.3 — deterministic score always dominates)
- **Modules Layer** (`src/modules/`) - Individual deterministic auditors per category
- **Dashboard Layer** (`src/dashboard/`) - React 19 + Mantine UI served by Express with SSE live progress
- **Utils Layer** (`src/utils/`) - Shared utilities

## Audit Categories (weights in CATEGORY_WEIGHTS)
1. **Components** (25%)
2. **Tokens** (20%)
3. **Documentation** (20%) - includes governance checks
4. **Accessibility** (13%)
5. **Tooling** (12%)
6. **Performance** (10%)

Grade bands: A >= 90, B >= 80, C >= 70, D >= 60, F below.

## AI Judge Notes
- Optional; requires ANTHROPIC_API_KEY (project `.env` or environment). The API key is never written to `.dsaudit.json`
- The engine instantiates the judge from `config.ai`; the CLI only supplies config
- No hardcoded model strings in the CLI — `LLMJudge` owns the default model; `ai.model` overrides it
- Judge output is absent on failure (never fabricated); scores are deterministic-only when AI is off
- Engine events: audit:start, category:start/complete/error, ai:start, ai:category, ai:complete, ai:error, audit:complete
- `AuditResult` may be `partial` with `metadata.failedCategories`; judged categories carry `deterministicScore` and `judge`

## Reports
- `ReportGenerator.generate(results, formats)` — formats is an array of 'json' | 'md'
- No HTML report format — use the dashboard for the interactive view

## Testing the Tool
```bash
npm run build
node dist/cli.js init --path /path/to/design-system
```

Or with existing config:
```bash
node dist/cli.js run --dashboard
```

## Development Notes
- TypeScript strict mode; ESM (`"type": "module"`)
- Node >= 18
- Express server for dashboard with SSE support
- Event-driven architecture for progress tracking
- Modular auditor system for extensibility
- Vite builds the dashboard to `dist/dashboard` (`emptyOutDir` scoped to that folder only)
