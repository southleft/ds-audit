# DSAudit Quick Start Guide

Requires Node.js >= 18.

## Installation

```bash
git clone https://github.com/southleft/dsaudit.git
cd dsaudit
npm install
npm run build
npm link
```

## Basic Usage

### 1. Run an audit on your current directory

```bash
dsaudit init
```

This will:
- Prompt for which modules to audit and whether to enable the AI judge
- Analyze 6 categories (components, tokens, documentation, tooling, performance, accessibility)
- Generate Markdown and JSON reports in `./audit/`
- Open the interactive dashboard at http://localhost:4321

### 2. Run on a specific directory

```bash
dsaudit init --path /path/to/your/design-system
```

### 3. Run without prompts (use defaults)

```bash
dsaudit init --no-interactive
```

AI is enabled automatically only when `ANTHROPIC_API_KEY` is set; otherwise scores are deterministic-only.

### 4. Re-run with an existing configuration (CI-friendly)

```bash
dsaudit run                    # uses ./.dsaudit.json
dsaudit run --quiet            # minimal output
dsaudit run --format json      # json and/or md
dsaudit run --dashboard        # start dashboard after the audit
```

### 5. Manage configuration

```bash
dsaudit config --show   # view current .dsaudit.json
dsaudit config --reset  # write defaults
```

## Optional: AI Judge

Enable the AI judge during `dsaudit init` (requires an Anthropic API key, stored in `.env`). It performs a rubric-based qualitative review of the documentation, components, and tokens categories, blended into their scores at a bounded weight (default 30% — deterministic scores always dominate). If the judge fails or is disabled, scores are fully deterministic.

## Understanding the Results

### Overall Score
- **A (90–100)**: Excellent design system health
- **B (80–89)**: Good with minor improvements needed
- **C (70–79)**: Average, several areas need attention
- **D (60–69)**: Below average, significant improvements needed
- **F (0–59)**: Major issues across multiple categories

### Categories Evaluated

1. **Components (25%)**: Structure, tests, TypeScript types, stories
2. **Design Tokens (20%)**: Token system, usage, hardcoded values
3. **Documentation (20%)**: README, component docs, governance
4. **Accessibility (13%)**: ARIA, keyboard support, semantic HTML (static heuristics)
5. **Tooling (12%)**: ESLint, Prettier, build tools, CI/CD
6. **Performance (10%)**: Bundle/packaging setup, build configuration

### Output

- `audit/report.md` — human-readable Markdown report
- `audit/results.json` — machine-readable JSON data
- Dashboard at http://localhost:4321 — interactive React + Mantine UI

## Example Output

```
=== Audit Summary ===
Overall Score: 75/100 (C)

Category Scores:
  Component Library: 85/100 (B)
  Design Tokens: 70/100 (C)
  Documentation: 60/100 (D)
  Tooling: 90/100 (A)
  Performance: 75/100 (C)
  Accessibility: 65/100 (D)

Top Recommendations:
  1. Add unit tests for all components [high]
  2. Create design token documentation [medium]
  3. Implement ARIA labels for interactive elements [high]
```

## Tips for Better Scores

1. **Quick wins**: add a comprehensive README, CONTRIBUTING.md, and ESLint configuration; use design tokens instead of hardcoded values
2. **Medium effort**: add unit tests, Storybook stories, proper TypeScript types, and accessibility attributes
3. **Long term**: establish a clear component structure, comprehensive documentation, and CI/CD pipelines

## Troubleshooting

### Port 4321 is already in use
The dashboard uses port 4321 by default (configurable via `dashboard.port` in `.dsaudit.json`).

### No components found
Ensure your components are in standard locations such as `components/`, `src/components/`, or `lib/components/`.

### Low scores
This is normal for projects without an established design system. Use the recommendations to improve gradually and re-run the audit to track progress.
