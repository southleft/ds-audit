# DSAudit — Design System Audit CLI

A CLI tool that evaluates the health, structure, and completeness of code-based design systems. It scores component quality, design token usage, documentation, tooling, performance, and accessibility, and produces actionable, prioritized recommendations.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)

## Key Features

- **Deterministic audits** across 6 categories with weighted A–F grades
- **Optional AI judge** — a rubric-based qualitative review powered by Claude, blended into scores at a bounded weight
- **Interactive dashboard** — React + Mantine UI with live audit progress (Server-Sent Events)
- **Reports** — Markdown and JSON output
- **Token coverage analysis** — detection of hardcoded values vs. design tokens
- **Actionable recommendations** with priority and effort ratings

## Quick Start

Requires Node.js >= 18.

```bash
git clone https://github.com/southleft/dsaudit.git
cd dsaudit
npm install
npm run build
npm link

# Then, in your design system project:
dsaudit init
```

Or run without linking:

```bash
node /path/to/dsaudit/dist/cli.js init --path /path/to/your/design-system
```

## Commands

### `dsaudit init`

Interactive setup and audit. Prompts for which modules to audit and whether to enable the AI judge, saves `.dsaudit.json`, runs the audit, generates reports, and opens the dashboard.

```bash
dsaudit init                     # audit the current directory
dsaudit init --path <dir>        # audit a specific directory
dsaudit init --no-interactive    # use defaults (AI enabled only if ANTHROPIC_API_KEY is set)
```

### `dsaudit run`

Non-interactive audit using an existing `.dsaudit.json` — suited for CI/CD.

```bash
dsaudit run                      # uses ./.dsaudit.json
dsaudit run --config <path>      # custom config file
dsaudit run --output <dir>       # override report output directory
dsaudit run --format json,md    # report formats (json, md)
dsaudit run --dashboard          # start the dashboard after the audit
dsaudit run --quiet              # minimal output for CI
```

### `dsaudit config`

```bash
dsaudit config --show   # pretty-print .dsaudit.json from the current directory
dsaudit config --reset  # write the default configuration
```

## Audit Categories

| Category | Weight | What it checks |
|---|---|---|
| Components | 25% | Structure, type safety, test coverage, stories |
| Design Tokens | 20% | Token architecture, coverage vs. hardcoded values, consistency |
| Documentation | 20% | README/CONTRIBUTING/CHANGELOG, component docs, governance |
| Accessibility | 13% | ARIA usage, keyboard support, focus management (static heuristics) |
| Tooling | 12% | Build system, testing infrastructure, linting, CI/CD |
| Performance | 10% | Bundle/packaging setup, code splitting, build configuration |

Grades: **A** ≥ 90, **B** ≥ 80, **C** ≥ 70, **D** ≥ 60, **F** below 60.

## AI Judge (optional)

When enabled, an LLM judge (Claude) performs a rubric-based qualitative review of the **documentation**, **components**, and **tokens** categories. Its score is blended into those categories at a bounded weight (default 30%) — the deterministic score always dominates. Judge input is clearly labeled in reports, and each judged category keeps its `deterministicScore` alongside the blended result.

- Requires `ANTHROPIC_API_KEY` (environment variable or project `.env`)
- Never fabricates output — if the judge call fails, its section is simply absent and scores remain deterministic
- With AI disabled (the default), all scores are fully deterministic

## Configuration

`dsaudit init` writes `.dsaudit.json` (the API key is stored only in `.env`, never in the JSON config). You can also copy `.dsaudit.example.json`:

```json
{
  "projectPath": "./",
  "outputPath": "./audit",
  "modules": {
    "components": true,
    "tokens": true,
    "documentation": true,
    "tooling": true,
    "performance": true,
    "accessibility": true
  },
  "ai": {
    "enabled": false
  },
  "dashboard": {
    "enabled": true,
    "port": 4321,
    "autoOpen": true
  }
}
```

Optional `ai` fields: `model` (defaults to the judge's built-in model) and `judgeWeight` (0–1, default 0.3).

## Output

- `audit/report.md` — human-readable Markdown report
- `audit/results.json` — machine-readable JSON data
- Dashboard at `http://localhost:4321` — interactive React + Mantine UI with live progress, category drill-down, action plan, and export

There is no HTML file report — the dashboard is the interactive HTML experience.

## Limitations

- **Accessibility** checks are static heuristics plus tooling detection. They catch common issues (missing ARIA labels, keyboard handler gaps) but full WCAG compliance requires runtime testing with real assistive technologies.
- **Performance** checks are packaging-oriented (bundle configuration, code splitting, build setup) — they do not measure runtime performance.
- Token coverage analysis is optimized for CSS, CSS Modules, and CSS-in-JS.

## Development

```bash
npm install
npm run dev        # development mode
npm run build      # compile TypeScript + build dashboard
npm test           # run tests
npm run lint       # ESLint
npm run typecheck  # TypeScript type checking
```

### Project Structure

```
dsaudit/
├── src/
│   ├── cli/           # CLI commands (init, run, config)
│   ├── core/          # Audit engine, scoring, report generation, LLM judge
│   ├── modules/       # Deterministic auditors per category
│   ├── dashboard/     # React + Mantine dashboard and Express server
│   └── utils/         # Shared utilities
├── dist/              # Compiled output
└── example-design-system/  # Example project for testing
```

## Contributing

Contributions are welcome. For major changes, please open an issue first at [github.com/southleft/dsaudit](https://github.com/southleft/dsaudit).

## Additional Resources

- [QUICKSTART.md](QUICKSTART.md) — quick start guide
- [example-design-system/](example-design-system/) — example project structure

## License

MIT License — see [LICENSE](LICENSE).
