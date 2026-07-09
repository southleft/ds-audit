import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';

export interface ExternalDesignSystem {
  name: string;
  packageName: string;
  version?: string;
  type: 'component-library' | 'utility' | 'css-framework';
  hasThemeSupport: boolean;
  documentation: string;
}

export interface ExternalDSAnalysis {
  detected: boolean;
  systems: ExternalDesignSystem[];
  mode: 'pure-local' | 'hybrid' | 'pure-external';
  localComponentCount: number;
  /** Count of DISTINCT components actually imported from external design
   * systems, measured by scanning import statements — never estimated. */
  externalComponentCount: number;
  themeCustomizations: ThemeCustomization[];
  scoringAdjustment: {
    componentWeight: number; // Reduced weight for component library score
    tokenWeight: number; // Increased weight for token/theme coverage
    reason: string;
  };
}

export interface ThemeCustomization {
  type: 'css-variables' | 'theme-config' | 'style-overrides' | 'token-mapping';
  file: string;
  description: string;
}

// Known design system packages
const KNOWN_DESIGN_SYSTEMS: Record<string, Omit<ExternalDesignSystem, 'version'>> = {
  '@mantine/core': {
    name: 'Mantine',
    packageName: '@mantine/core',
    type: 'component-library',
    hasThemeSupport: true,
    documentation: 'https://mantine.dev',
  },
  '@mui/material': {
    name: 'Material UI',
    packageName: '@mui/material',
    type: 'component-library',
    hasThemeSupport: true,
    documentation: 'https://mui.com',
  },
  '@chakra-ui/react': {
    name: 'Chakra UI',
    packageName: '@chakra-ui/react',
    type: 'component-library',
    hasThemeSupport: true,
    documentation: 'https://chakra-ui.com',
  },
  'antd': {
    name: 'Ant Design',
    packageName: 'antd',
    type: 'component-library',
    hasThemeSupport: true,
    documentation: 'https://ant.design',
  },
  '@radix-ui/themes': {
    name: 'Radix Themes',
    packageName: '@radix-ui/themes',
    type: 'component-library',
    hasThemeSupport: true,
    documentation: 'https://radix-ui.com',
  },
  'primereact': {
    name: 'PrimeReact',
    packageName: 'primereact',
    type: 'component-library',
    hasThemeSupport: true,
    documentation: 'https://primereact.org',
  },
  '@fluentui/react': {
    name: 'Fluent UI',
    packageName: '@fluentui/react',
    type: 'component-library',
    hasThemeSupport: true,
    documentation: 'https://developer.microsoft.com/en-us/fluentui',
  },
  '@carbon/react': {
    name: 'Carbon Design System',
    packageName: '@carbon/react',
    type: 'component-library',
    hasThemeSupport: true,
    documentation: 'https://carbondesignsystem.com',
  },
  'semantic-ui-react': {
    name: 'Semantic UI React',
    packageName: 'semantic-ui-react',
    type: 'component-library',
    hasThemeSupport: true,
    documentation: 'https://react.semantic-ui.com',
  },
  '@blueprintjs/core': {
    name: 'Blueprint',
    packageName: '@blueprintjs/core',
    type: 'component-library',
    hasThemeSupport: true,
    documentation: 'https://blueprintjs.com',
  },
  'react-bootstrap': {
    name: 'React Bootstrap',
    packageName: 'react-bootstrap',
    type: 'component-library',
    hasThemeSupport: true,
    documentation: 'https://react-bootstrap.github.io',
  },
  'tailwindcss': {
    name: 'Tailwind CSS',
    packageName: 'tailwindcss',
    type: 'css-framework',
    hasThemeSupport: true,
    documentation: 'https://tailwindcss.com',
  },
  'daisyui': {
    name: 'daisyUI',
    packageName: 'daisyui',
    type: 'component-library',
    hasThemeSupport: true,
    documentation: 'https://daisyui.com',
  },
  '@headlessui/react': {
    name: 'Headless UI',
    packageName: '@headlessui/react',
    type: 'component-library',
    hasThemeSupport: false,
    documentation: 'https://headlessui.com',
  },
};

// Patterns for theme customization detection. Each group's globs are scanned
// for real files; a file is classified once (first matching group wins).
const THEME_PATTERNS: Record<ThemeCustomization['type'], string[]> = {
  'theme-config': [
    '**/theme.{ts,tsx,js}',
    '**/theme/index.{ts,tsx}',
    '**/ThemeProvider.tsx',
    '**/mantine.config.ts',
    'tailwind.config.{js,ts,cjs,mjs}',
  ],
  'token-mapping': [
    '**/tokens.json',
    '**/tokens.ts',
    '**/design-tokens.json',
    '**/style-dictionary.config.{js,cjs,mjs}',
  ],
  'css-variables': [
    '**/theme.{css,scss}',
    '**/variables.{css,scss}',
    '**/_variables.scss',
    '**/tokens.css',
  ],
  'style-overrides': ['**/overrides.{css,scss}', '**/custom.{css,scss}'],
};

const SCAN_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
];

export class ExternalDSDetector {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  async analyze(localComponentCount: number): Promise<ExternalDSAnalysis> {
    const detectedSystems = await this.detectExternalSystems();
    const themeCustomizations = await this.detectThemeCustomizations();
    const externalComponentCount = await this.countExternalComponentImports(detectedSystems);

    const detected = detectedSystems.length > 0;
    const mode = this.determineMode(localComponentCount, externalComponentCount, detected);
    const scoringAdjustment = this.calculateScoringAdjustment(mode);

    return {
      detected,
      systems: detectedSystems,
      mode,
      localComponentCount,
      externalComponentCount,
      themeCustomizations,
      scoringAdjustment,
    };
  }

  /**
   * Detect known external design systems from dependencies aggregated across
   * EVERY package.json in the repo (monorepo-aware), not just the root.
   */
  private async detectExternalSystems(): Promise<ExternalDesignSystem[]> {
    const detected = new Map<string, ExternalDesignSystem>();

    const packageJsonPaths = await glob('**/package.json', {
      cwd: this.projectPath,
      ignore: SCAN_IGNORE,
      absolute: false,
    });

    for (const relPath of packageJsonPaths) {
      try {
        const content = await fs.readFile(path.join(this.projectPath, relPath), 'utf-8');
        const packageJson = JSON.parse(content);
        const allDeps: Record<string, string> = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        for (const [pkgName, version] of Object.entries(allDeps)) {
          const knownDS = KNOWN_DESIGN_SYSTEMS[pkgName];
          if (knownDS && !detected.has(pkgName)) {
            detected.set(pkgName, { ...knownDS, version });
          }
        }
      } catch {
        // Unreadable or unparseable package.json — skip
      }
    }

    return Array.from(detected.values());
  }

  /**
   * Count REAL external component usage: scan source files for import
   * statements from the detected design system packages and count the
   * distinct component identifiers imported. No hardcoded per-library
   * estimates — an installed-but-unused library counts as zero.
   */
  private async countExternalComponentImports(
    systems: ExternalDesignSystem[]
  ): Promise<number> {
    const componentPackages = systems.filter(s => s.type === 'component-library');
    if (componentPackages.length === 0) return 0;

    const sourceFiles = await glob('**/*.{tsx,jsx,ts,js}', {
      cwd: this.projectPath,
      ignore: SCAN_IGNORE,
      absolute: false,
    });

    const distinctImports = new Set<string>();
    const importRegex =
      /import\s+(?:type\s+)?([^;'"]+?)\s+from\s+['"]([^'"]+)['"]/g;

    for (const relPath of sourceFiles) {
      let content: string;
      try {
        content = await fs.readFile(path.join(this.projectPath, relPath), 'utf-8');
      } catch {
        continue;
      }

      for (const match of content.matchAll(importRegex)) {
        const clause = match[1];
        const moduleName = match[2];

        const pkg = componentPackages.find(
          s => moduleName === s.packageName || moduleName.startsWith(`${s.packageName}/`)
        );
        if (!pkg) continue;

        for (const name of this.extractImportedNames(clause)) {
          // Components are PascalCase identifiers; hooks/utilities are not.
          if (/^[A-Z]/.test(name)) {
            distinctImports.add(`${pkg.packageName}:${name}`);
          }
        }
      }
    }

    return distinctImports.size;
  }

  /** Extract identifiers from an import clause: default, named, and aliases. */
  private extractImportedNames(clause: string): string[] {
    const names: string[] = [];
    const trimmed = clause.trim();

    // Named imports inside braces (respect `as` aliases: count the ORIGINAL
    // exported name so aliasing doesn't inflate the distinct count).
    const braceMatch = trimmed.match(/\{([^}]*)\}/);
    if (braceMatch) {
      for (const part of braceMatch[1].split(',')) {
        const original = part.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, '').trim();
        if (original) names.push(original);
      }
    }

    // Default import (before any brace)
    const beforeBrace = trimmed.split('{')[0].replace(/,\s*$/, '').trim();
    if (beforeBrace && !beforeBrace.startsWith('*') && /^[A-Za-z_$][\w$]*$/.test(beforeBrace)) {
      names.push(beforeBrace);
    }

    return names;
  }

  /**
   * Find theme customization files with real globs. Each file is reported
   * once — the previous implementation pushed the same file repeatedly (once
   * per pattern per type).
   */
  private async detectThemeCustomizations(): Promise<ThemeCustomization[]> {
    const customizations: ThemeCustomization[] = [];
    const seenFiles = new Set<string>();

    for (const [type, patterns] of Object.entries(THEME_PATTERNS)) {
      for (const pattern of patterns) {
        let matches: string[];
        try {
          matches = await glob(pattern, {
            cwd: this.projectPath,
            ignore: SCAN_IGNORE,
            absolute: false,
          });
        } catch {
          continue;
        }

        for (const file of matches) {
          if (seenFiles.has(file)) continue;
          seenFiles.add(file);

          try {
            const content = await fs.readFile(path.join(this.projectPath, file), 'utf-8');
            const description = this.describeCustomization(file, content);
            if (description) {
              customizations.push({
                type: type as ThemeCustomization['type'],
                file,
                description,
              });
            }
          } catch {
            // Unreadable file — skip
          }
        }
      }
    }

    return customizations;
  }

  private describeCustomization(file: string, content: string): string | null {
    if (file.includes('tailwind.config')) {
      if (content.includes('extend')) {
        return 'Tailwind CSS theme extension with custom values';
      }
      return 'Tailwind CSS configuration';
    }

    if (file.includes('theme') || file.includes('Theme')) {
      if (
        content.includes('createTheme') ||
        content.includes('MantineProvider') ||
        content.includes('ThemeProvider')
      ) {
        return 'Custom theme configuration for component library';
      }
    }

    if (file.includes('variables') || file.includes('tokens')) {
      const varCount = (content.match(/--[\w-]+:/g) || []).length;
      const scssVarCount = (content.match(/\$[\w-]+:/g) || []).length;
      const totalVars = varCount + scssVarCount;

      if (totalVars > 0) {
        return `Design tokens/variables file with ${totalVars} custom values`;
      }
    }

    return null;
  }

  /**
   * Mode from REAL counts on both sides:
   *   - no external DS detected, or detected but zero components actually
   *     imported → pure-local (installed-but-unused shouldn't shift weights)
   *   - external imports and no local components → pure-external
   *   - otherwise by the external share of all distinct components in use:
   *     >= 80% external → pure-external, >= 20% → hybrid, else pure-local
   */
  private determineMode(
    localCount: number,
    externalCount: number,
    hasExternalDS: boolean
  ): ExternalDSAnalysis['mode'] {
    if (!hasExternalDS || externalCount === 0) {
      return 'pure-local';
    }

    if (localCount === 0) {
      return 'pure-external';
    }

    const externalShare = externalCount / (externalCount + localCount);
    if (externalShare >= 0.8) return 'pure-external';
    if (externalShare >= 0.2) return 'hybrid';
    return 'pure-local';
  }

  private calculateScoringAdjustment(
    mode: ExternalDSAnalysis['mode']
  ): ExternalDSAnalysis['scoringAdjustment'] {
    switch (mode) {
      case 'pure-external':
        return {
          componentWeight: 0.1, // Component library score is much less important
          tokenWeight: 0.35, // Token/theming is more important
          reason:
            'Using external design system - scoring emphasizes theming and token customization',
        };

      case 'hybrid':
        return {
          componentWeight: 0.15, // Reduced but still relevant
          tokenWeight: 0.3, // Token weight increased
          reason:
            'Hybrid design system detected - balanced scoring between local components and theming',
        };

      case 'pure-local':
      default:
        return {
          componentWeight: 0.25, // Standard component weight
          tokenWeight: 0.2, // Standard token weight
          reason: 'Local design system - standard component-focused scoring',
        };
    }
  }

  /**
   * Generate a summary message for the audit report
   */
  static generateSummary(analysis: ExternalDSAnalysis): string {
    if (!analysis.detected) {
      return '';
    }

    const systemNames = analysis.systems.map(s => s.name).join(', ');

    let summary = `**External Design System Detected**: ${systemNames}\n\n`;

    switch (analysis.mode) {
      case 'pure-external':
        summary += `This project imports ${analysis.externalComponentCount} distinct components from ${systemNames}. `;
        summary += `The audit focuses on theming, token architecture, and customization rather than local component implementation.\n`;
        break;
      case 'hybrid':
        summary += `This project combines ${analysis.externalComponentCount} distinct imported components from ${systemNames} with ${analysis.localComponentCount} local components. `;
        summary += `The audit evaluates both the local component quality and theme/token customization layer.\n`;
        break;
      case 'pure-local':
        summary += `${systemNames} is present in dependencies, but component usage is negligible — the audit uses standard local-component scoring.\n`;
        break;
    }

    if (analysis.themeCustomizations.length > 0) {
      summary += `\n**Theme Customizations Found**:\n`;
      for (const customization of analysis.themeCustomizations) {
        summary += `- ${customization.file}: ${customization.description}\n`;
      }
    }

    summary += `\n*Scoring adjusted: Component weight ${(analysis.scoringAdjustment.componentWeight * 100).toFixed(0)}%, Token weight ${(analysis.scoringAdjustment.tokenWeight * 100).toFixed(0)}%*`;

    return summary;
  }
}
