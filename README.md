# 🎨 dsaudit - Design System Audit CLI Tool

A comprehensive CLI-based auditing tool that evaluates the health, structure, and completeness of code-based design systems. It provides deep insights into component quality, token usage, documentation completeness, and overall system maturity with actionable recommendations for improvement.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)

## ✨ Key Features

- 🔍 **Comprehensive Analysis**: Audits 7 critical aspects of design systems
- 📊 **Interactive Dashboard**: Real-time visualization with Chart.js
- 🤖 **AI-Powered Insights**: Optional Claude API integration for intelligent recommendations
- 📈 **Smart Scoring**: Weighted category grades (A-F) with detailed metrics
- 🎯 **Actionable Recommendations**: Priority-sorted with effort/impact analysis
- 🚀 **Token Coverage Analysis**: Advanced detection of hardcoded values vs. design tokens
- ♿ **Accessibility Focus**: WCAG compliance checking and recommendations
- 📝 **Multiple Output Formats**: Markdown reports, JSON data, and HTML dashboard

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/dsaudit.git
cd dsaudit

# Install dependencies
npm install

# Build the tool
npm run build

# Link globally (optional)
npm link
```

### Running Your First Audit

```bash
# Navigate to your design system project
cd /path/to/your/design-system

# Run the audit
dsaudit init

# Or use npx without installing
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
- **Smart Coverage Analysis**: Calculates actual token usage vs. hardcoded values
- Format consistency across CSS, JSON, and JS tokens
- Token redundancy detection
- Semantic token relationships

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

## 🛠️ Development

### Prerequisites
- Node.js >= 18.0.0
- npm or yarn
- TypeScript 5.0+

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build the project
npm run build

# Run tests
npm test

# Lint and type-check
npm run lint
npm run typecheck
```

### Project Structure

```
dsaudit/
├── src/
│   ├── cli/           # CLI commands and entry points
│   ├── core/          # Core audit engine and scoring
│   ├── modules/       # Individual audit modules
│   ├── dashboard/     # Web dashboard UI
│   └── utils/         # Shared utilities
├── dist/              # Compiled output
└── example-design-system/  # Example for testing
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Areas for Contribution
- Additional audit modules
- Framework-specific analyzers (React, Vue, Angular, etc.)
- Enhanced token detection algorithms
- Accessibility testing improvements
- Dashboard UI enhancements

## 📚 Additional Resources

- [QUICKSTART.md](QUICKSTART.md) - Quick start guide for immediate setup
- [CLAUDE.md](CLAUDE.md) - Claude AI integration details
- [example-design-system/](example-design-system/) - Example project structure

## 🐛 Known Issues

- Token coverage calculation is optimized for CSS-in-JS and CSS Modules
- AI insights require a Claude API key
- Dashboard requires modern browser with ES6 support

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🙏 Acknowledgments

- Built with TypeScript and Node.js
- Dashboard powered by Chart.js
- AI insights powered by Claude (Anthropic)

---

**Note**: This tool is in active development. Please report any issues or feature requests on the [GitHub Issues](https://github.com/yourusername/dsaudit/issues) page.
