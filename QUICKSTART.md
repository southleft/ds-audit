# dsaudit Quick Start Guide

## Installation

You don't need to install dsaudit globally. You can run it directly using npx:

```bash
npx dsaudit init
```

## Basic Usage

### 1. Run an audit on your current directory

```bash
npx dsaudit init
```

This will:
- Scan your design system files
- Analyze 7 categories (components, tokens, docs, etc.)
- Generate reports in `./audit/`
- Open an interactive dashboard at http://localhost:4321

### 2. Run on a specific directory

```bash
npx dsaudit init --path /path/to/your/design-system
```

### 3. Run without prompts (use defaults)

```bash
npx dsaudit init --no-interactive
```

### 4. With AI-powered insights (requires Anthropic API key)

```bash
npx dsaudit init
# Select "Enable AI insights" when prompted
# Enter your Anthropic API key
```

## Understanding the Results

### Overall Score
- **A (90-100)**: Excellent design system health
- **B (80-89)**: Good with minor improvements needed
- **C (70-79)**: Average, several areas need attention
- **D (60-69)**: Below average, significant improvements needed
- **F (0-59)**: Major issues across multiple categories

### Categories Evaluated

1. **Component Library (25%)**: Structure, tests, accessibility, TypeScript
2. **Design Tokens (20%)**: Token system, usage, hardcoded values
3. **Documentation (15%)**: README, component docs, Storybook
4. **Governance (10%)**: Contributing guides, versioning
5. **Tooling (10%)**: ESLint, Prettier, build tools
6. **Performance (10%)**: Bundle size, optimization
7. **Accessibility (10%)**: ARIA, keyboard support, semantic HTML

### Output Files

- `audit/report.md` - Human-readable markdown report
- `audit/results.json` - Machine-readable JSON data
- Dashboard at http://localhost:4321 - Interactive visualizations

## Example Output

```
=== Audit Summary ===
Overall Score: 75/100 (C)

Category Scores:
  Component Library: 85/100 (B)
  Design Tokens: 70/100 (C)
  Documentation: 60/100 (D)
  Governance: 80/100 (B)
  Tooling: 90/100 (A)
  Performance: 75/100 (C)
  Accessibility: 65/100 (D)

Top Recommendations:
  1. Add unit tests for all components [high]
  2. Create design token documentation [medium]
  3. Implement ARIA labels for interactive elements [high]
```

## Tips for Better Scores

1. **Quick Wins**:
   - Add a comprehensive README.md
   - Create CONTRIBUTING.md
   - Add ESLint configuration
   - Use design tokens instead of hardcoded values

2. **Medium Effort**:
   - Add unit tests for components
   - Create Storybook stories
   - Implement proper TypeScript types
   - Add accessibility attributes

3. **Long Term**:
   - Establish atomic design structure
   - Create comprehensive documentation
   - Implement CI/CD pipelines
   - Add visual regression testing

## Troubleshooting

### Port 4321 is already in use
The dashboard uses port 4321 by default. If it's in use, the CLI will notify you.

### No components found
Ensure your components are in standard locations:
- `components/`
- `src/components/`
- `lib/components/`

### Low scores
This is normal for projects without an established design system. Use the recommendations to improve gradually.

## Next Steps

1. Review the generated report
2. Prioritize high-impact, quick-win recommendations
3. Re-run the audit periodically to track progress
4. Share results with your team

Need help? Visit: https://github.com/yourusername/dsaudit