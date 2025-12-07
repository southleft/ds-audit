# Claude Code Context for dsaudit

## Project Overview
This is a CLI-based design system auditing tool ("Chrome Lighthouse for design systems") that evaluates the health, structure, and completeness of code-based design systems.

## Key Commands
- `npm run build` - Build the TypeScript project
- `npm run dev` - Run in development mode
- `npm run lint` - Run ESLint
- `npm run typecheck` - Check TypeScript types
- `npm test` - Run tests

## CLI Commands
- `dsaudit init --path <project>` - Interactive audit with prompts
- `dsaudit run` - Non-interactive audit using `.dsaudit.json` config
  - `--config <path>` - Custom config file path
  - `--output <dir>` - Output directory for reports
  - `--format <formats>` - Output formats: json,md,html
  - `--dashboard` - Start dashboard after audit
  - `--quiet` - Minimal output for CI/CD

## Architecture
- **CLI Layer** (`src/cli/`) - Command handling (init, run commands)
- **Core Layer** (`src/core/`) - Audit engine, scoring, AI integration
- **Modules Layer** (`src/modules/`) - Individual auditors for each category
- **Dashboard Layer** (`src/dashboard/`) - React 19 + Mantine UI visualization
- **Utils Layer** (`src/utils/`) - Shared utilities

## Dashboard Views (6 focused views)
1. **Overview** - Score summary and category breakdown
2. **Categories** - Detailed per-category analysis with real data
3. **Action Plan** - Prioritized improvement tasks
4. **Recommendations** - AI-powered suggestions
5. **Live Progress** - Real-time audit progress via SSE
6. **Export** - Download reports in various formats

## Audit Categories
1. **Components** (25%) - Component structure, tests, accessibility
2. **Tokens** (20%) - Design token architecture and usage
3. **Documentation** (20%) - Docs, governance guidelines, versioning
4. **Tooling** (12%) - Build tools, linting, testing, CI/CD
5. **Performance** (10%) - Bundle size, build performance
6. **Accessibility** (13%) - ARIA compliance, keyboard support

## Testing the Tool
To test on a project:
```bash
npm run build
node dist/cli.js init --path /path/to/design-system
```

Or with existing config:
```bash
node dist/cli.js run --dashboard
```

## Key Features
- Comprehensive multi-category analysis
- AI-powered insights (optional with Claude API)
- Interactive React dashboard with Mantine UI
- Detailed Markdown and JSON reports
- Real-time progress tracking via Server-Sent Events
- Actionable recommendations with priority/effort ratings
- Token coverage analysis with spatial indexing

## Development Notes
- Uses TypeScript with strict mode
- Express server for dashboard with SSE support
- Event-driven architecture for progress tracking
- Modular auditor system for extensibility
- React 19 + Mantine v7 for dashboard UI
- Vite for dashboard bundling

## Recent Cleanup (Dec 2024)
- Removed legacy HTML dashboard files (4,754 lines)
- Removed unused dependencies (@tabler/icons-react, lighthouse, axe-core)
- Removed mock data generation - all displayed data is now real
- Consolidated dashboard from 9 views to 6 focused views
- Implemented full `run` command for non-interactive usage