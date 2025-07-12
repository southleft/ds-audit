# dsaudit - Design System Audit CLI Tool

A CLI-based auditing tool designed to evaluate the health, structure, and completeness of code-based design systems. It assesses everything from component quality to documentation, governance, token usage, and supporting infrastructure, producing a comprehensive AI-informed report with actionable insights.

## Features

- 🔍 **Comprehensive Analysis**: Audits components, tokens, documentation, governance, tooling, performance, and accessibility
- 📊 **Visual Reporting**: Interactive dashboard with charts and detailed metrics
- 🤖 **AI-Powered Insights**: Optional Claude API integration for enhanced recommendations
- 📈 **Scoring System**: Per-category grades (A-F) and overall health score
- 🎯 **Actionable Recommendations**: Prioritized suggestions with effort estimates
- 🚀 **Real-time Progress**: Live updates during audit execution

## Installation

```bash
npm install -g dsaudit
```

Or run directly with npx:

```bash
npx dsaudit init
```

## Usage

### Initialize and Run Audit

```bash
dsaudit init
```

This command:
1. Scans your current directory for design system files
2. Prompts for configuration options
3. Runs the audit
4. Generates reports in `./audit` directory
5. Opens an interactive dashboard (if enabled)

### Run with Existing Configuration

```bash
dsaudit run
```

### Configure Settings

```bash
dsaudit config --show  # View current configuration
dsaudit config --reset # Reset to defaults
```

## Audit Categories

### 1. Component Library (25% weight)
- Component structure and organization
- Type safety and prop validation
- Test coverage
- Accessibility compliance
- Documentation completeness

### 2. Design Tokens (20% weight)
- Token architecture (global, semantic, component-level)
- Usage patterns (hardcoded vs. tokenized)
- Format consistency
- Token documentation

### 3. Documentation (15% weight)
- Component-level documentation
- System-level guides
- API documentation
- Usage examples

### 4. Governance & Guidelines (10% weight)
- Contributing guidelines
- Versioning strategy
- Change management
- Release processes

### 5. Tooling & Infrastructure (10% weight)
- Build system configuration
- Development environment
- CI/CD setup
- Linting and formatting

### 6. Performance (10% weight)
- Bundle size analysis
- Build performance
- Runtime performance metrics

### 7. Accessibility (10% weight)
- ARIA compliance
- Keyboard navigation
- Screen reader support
- Color contrast

## Configuration

The tool creates a `.dsaudit.json` configuration file:

```json
{
  "projectPath": "./",
  "outputPath": "./audit",
  "modules": {
    "components": true,
    "tokens": true,
    "documentation": true,
    "governance": true,
    "tooling": true,
    "performance": true,
    "accessibility": true
  },
  "ai": {
    "enabled": false,
    "apiKey": "your-api-key"
  },
  "dashboard": {
    "enabled": true,
    "port": 3000,
    "autoOpen": true
  }
}
```

## Output

### Reports
- `audit/report.md` - Comprehensive markdown report
- `audit/results.json` - Detailed JSON data
- `audit/dashboard` - Interactive HTML dashboard

### Dashboard Features
- Real-time audit progress
- Interactive charts (radar, bar, pie, etc.)
- Drill-down into specific findings
- Export capabilities
- Recommendation tracking

## Hooks Integration

This project includes Claude Code hooks for enhanced development:
- **PreToolUse**: Validates changes against design system standards
- **PostToolUse**: Runs automatic audits on modifications
- **Notification**: Monitors system health during development

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## Additional Resources

- [QUICKSTART.md](QUICKSTART.md) - Quick start guide for immediate setup
- [CLAUDE.md](CLAUDE.md) - Claude AI integration details
- [example-design-system/](example-design-system/) - Example project structure

## License

MIT
