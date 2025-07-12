# Claude Code Context for dsaudit

## Project Overview
This is a CLI-based design system auditing tool that evaluates the health, structure, and completeness of code-based design systems.

## Key Commands
- `npm run build` - Build the TypeScript project
- `npm run dev` - Run in development mode
- `npm run lint` - Run ESLint
- `npm run typecheck` - Check TypeScript types
- `npm test` - Run tests

## Architecture
- **CLI Layer** (`src/cli/`) - Command handling and user interaction
- **Core Layer** (`src/core/`) - Audit engine, scoring, AI integration
- **Modules Layer** (`src/modules/`) - Individual auditors for each category
- **Dashboard Layer** (`src/dashboard/`) - Interactive visualization
- **Utils Layer** (`src/utils/`) - Shared utilities

## Audit Categories
1. **Components** (25%) - Component structure, tests, accessibility
2. **Tokens** (20%) - Design token architecture and usage
3. **Documentation** (15%) - Docs completeness and quality
4. **Governance** (10%) - Contributing guidelines, versioning
5. **Tooling** (10%) - Build tools, linting, Storybook
6. **Performance** (10%) - Bundle size, build performance
7. **Accessibility** (10%) - ARIA compliance, keyboard support

## Testing the Tool
To test on a project:
```bash
npm run build
node dist/cli.js init --path /path/to/design-system
```

## Key Features
- Comprehensive multi-category analysis
- AI-powered insights (optional with Claude API)
- Interactive HTML dashboard with Chart.js
- Detailed Markdown and JSON reports
- Real-time progress tracking
- Actionable recommendations with priority/effort ratings

## Development Notes
- Uses TypeScript with strict mode
- Express server for dashboard
- Event-driven architecture for progress tracking
- Modular auditor system for extensibility