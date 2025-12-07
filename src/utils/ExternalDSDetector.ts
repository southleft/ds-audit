import { promises as fs } from 'fs';
import path from 'path';

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
  externalComponentCount: number;
  themeCustomizations: ThemeCustomization[];
  scoringAdjustment: {
    componentWeight: number;  // Reduced weight for component library score
    tokenWeight: number;      // Increased weight for token/theme coverage
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

// Patterns for theme customization detection
const THEME_PATTERNS = {
  'css-variables': [
    '**/theme.css',
    '**/theme.scss',
    '**/variables.css',
    '**/variables.scss',
    '**/_variables.scss',
    '**/tokens.css',
  ],
  'theme-config': [
    '**/theme.ts',
    '**/theme.tsx',
    '**/theme.js',
    '**/theme/index.ts',
    '**/theme/index.tsx',
    '**/ThemeProvider.tsx',
    '**/mantine.config.ts',
    '**/tailwind.config.js',
    '**/tailwind.config.ts',
  ],
  'style-overrides': [
    '**/overrides.css',
    '**/overrides.scss',
    '**/custom.css',
    '**/custom.scss',
  ],
  'token-mapping': [
    '**/tokens.json',
    '**/tokens.ts',
    '**/design-tokens.json',
    '**/style-dictionary.config.js',
  ],
};

export class ExternalDSDetector {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  async analyze(localComponentCount: number): Promise<ExternalDSAnalysis> {
    const detectedSystems = await this.detectExternalSystems();
    const themeCustomizations = await this.detectThemeCustomizations();
    const externalComponentCount = await this.estimateExternalComponentUsage(detectedSystems);

    const detected = detectedSystems.length > 0;
    const mode = this.determineMode(localComponentCount, externalComponentCount, detected);
    const scoringAdjustment = this.calculateScoringAdjustment(mode, themeCustomizations.length);

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

  private async detectExternalSystems(): Promise<ExternalDesignSystem[]> {
    const detected: ExternalDesignSystem[] = [];

    try {
      const packageJsonPath = path.join(this.projectPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      for (const [pkgName, version] of Object.entries(allDeps)) {
        const knownDS = KNOWN_DESIGN_SYSTEMS[pkgName];
        if (knownDS) {
          detected.push({
            ...knownDS,
            version: version as string,
          });
        }
      }
    } catch (error) {
      // Package.json not found or parse error
    }

    return detected;
  }

  private async detectThemeCustomizations(): Promise<ThemeCustomization[]> {
    const customizations: ThemeCustomization[] = [];

    for (const [type, patterns] of Object.entries(THEME_PATTERNS)) {
      for (const pattern of patterns) {
        // Simple check for common theme files
        const filesToCheck = [
          'src/theme.ts',
          'src/theme.tsx',
          'src/theme/index.ts',
          'src/styles/variables.scss',
          'src/styles/tokens.css',
          'tailwind.config.js',
          'tailwind.config.ts',
          'mantine.config.ts',
        ];

        for (const file of filesToCheck) {
          try {
            const filePath = path.join(this.projectPath, file);
            await fs.access(filePath);

            // File exists, check if it's a customization
            const content = await fs.readFile(filePath, 'utf-8');
            const description = this.describeCustomization(file, content);

            if (description) {
              customizations.push({
                type: type as ThemeCustomization['type'],
                file,
                description,
              });
            }
          } catch {
            // File doesn't exist
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
      if (content.includes('createTheme') || content.includes('MantineProvider') || content.includes('ThemeProvider')) {
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

  private async estimateExternalComponentUsage(systems: ExternalDesignSystem[]): Promise<number> {
    // Estimate based on known component counts per design system
    const componentCounts: Record<string, number> = {
      '@mantine/core': 80,
      '@mui/material': 60,
      '@chakra-ui/react': 50,
      'antd': 70,
      '@radix-ui/themes': 30,
      'primereact': 90,
      '@fluentui/react': 40,
      '@carbon/react': 40,
      'semantic-ui-react': 50,
      '@blueprintjs/core': 45,
      'react-bootstrap': 40,
      'daisyui': 55,
      '@headlessui/react': 10,
    };

    return systems.reduce((total, system) => {
      return total + (componentCounts[system.packageName] || 20);
    }, 0);
  }

  private determineMode(
    localCount: number,
    externalCount: number,
    hasExternalDS: boolean
  ): ExternalDSAnalysis['mode'] {
    if (!hasExternalDS) {
      return 'pure-local';
    }

    if (localCount === 0) {
      return 'pure-external';
    }

    // If local components are less than 20% of external, consider it mostly external
    if (localCount < externalCount * 0.2) {
      return 'pure-external';
    }

    return 'hybrid';
  }

  private calculateScoringAdjustment(
    mode: ExternalDSAnalysis['mode'],
    themeCustomizationCount: number
  ): ExternalDSAnalysis['scoringAdjustment'] {
    switch (mode) {
      case 'pure-external':
        return {
          componentWeight: 0.1,  // Component library score is much less important
          tokenWeight: 0.35,     // Token/theming is more important
          reason: 'Using external design system - scoring emphasizes theming and token customization',
        };

      case 'hybrid':
        return {
          componentWeight: 0.15,  // Reduced but still relevant
          tokenWeight: 0.30,      // Token weight increased
          reason: 'Hybrid design system detected - balanced scoring between local components and theming',
        };

      case 'pure-local':
      default:
        return {
          componentWeight: 0.25,  // Standard component weight
          tokenWeight: 0.20,      // Standard token weight
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
        summary += `This project primarily uses external components from ${systemNames}. `;
        summary += `The audit focuses on theming, token architecture, and customization rather than local component implementation.\n`;
        break;
      case 'hybrid':
        summary += `This project combines ${systemNames} with ${analysis.localComponentCount} local components. `;
        summary += `The audit evaluates both the local component quality and theme/token customization layer.\n`;
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
