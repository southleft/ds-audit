import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';

export interface StyleDictionaryConfig {
  source?: string[];
  include?: string[];
  platforms?: Record<string, any>;
  transforms?: string[];
  transformGroup?: string;
  parsers?: any[];
}

export interface TokenTransformPattern {
  prefix?: string;
  caseStyle?: 'camel' | 'kebab' | 'snake' | 'pascal' | 'constant';
  separator?: string;
  customTransform?: (name: string) => string;
}

export class StyleDictionaryDetector {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Detect Style Dictionary configuration files in the project
   */
  async detectConfigFiles(): Promise<string[]> {
    const patterns = [
      '**/style-dictionary.config.{js,mjs,json}',
      '**/config.{js,mjs,json}',
      '**/build.{js,mjs}',
      '**/sd.config.{js,mjs,json}',
      '!**/node_modules/**'
    ];

    const configFiles: string[] = [];

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: this.projectPath,
        absolute: false
      });

      // Filter for likely Style Dictionary configs
      for (const file of files) {
        if (await this.isStyleDictionaryConfig(path.join(this.projectPath, file))) {
          configFiles.push(file);
        }
      }
    }

    return configFiles;
  }

  /**
   * Check if a file is likely a Style Dictionary configuration
   */
  private async isStyleDictionaryConfig(filePath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Check for Style Dictionary patterns
      const patterns = [
        /StyleDictionary/,
        /registerTransform/,
        /registerFormat/,
        /buildAllPlatforms/,
        /platforms\s*:\s*{/,
        /transforms\s*:\s*\[/,
        /name\/.*kebab/,
        /css\/variables/
      ];

      return patterns.some(pattern => pattern.test(content));
    } catch {
      return false;
    }
  }

  /**
   * Parse Style Dictionary configuration to extract transform patterns
   */
  async parseTransformPatterns(configPath: string): Promise<TokenTransformPattern> {
    const pattern: TokenTransformPattern = {
      caseStyle: 'kebab',
      separator: '-'
    };

    try {
      const content = await fs.readFile(path.join(this.projectPath, configPath), 'utf-8');

      // Look for custom name transforms
      const nameTransformMatch = content.match(/name['"]\s*:\s*['"]([^'"]+)['"]/);
      if (nameTransformMatch) {
        const transformName = nameTransformMatch[1];

        // Extract prefix patterns
        const prefixMatch = content.match(/['"`](\w+)-\$\{/);
        if (prefixMatch) {
          pattern.prefix = prefixMatch[1];
        }

        // Detect case style from transform name or implementation
        if (transformName.includes('kebab') || content.includes('toKebab')) {
          pattern.caseStyle = 'kebab';
          pattern.separator = '-';
        } else if (transformName.includes('camel')) {
          pattern.caseStyle = 'camel';
          pattern.separator = '';
        } else if (transformName.includes('snake')) {
          pattern.caseStyle = 'snake';
          pattern.separator = '_';
        } else if (transformName.includes('constant')) {
          pattern.caseStyle = 'constant';
          pattern.separator = '_';
        }
      }

      // Look for explicit prefix definitions
      const explicitPrefixMatch = content.match(/return\s+['"`](\w+)[-_]/);
      if (explicitPrefixMatch && !pattern.prefix) {
        pattern.prefix = explicitPrefixMatch[1];
      }

      // Check for cbds or other common prefixes
      if (content.includes('cbds-') || content.includes('"cbds"')) {
        pattern.prefix = 'cbds';
      }

    } catch (error) {
      console.warn(`Could not parse Style Dictionary config at ${configPath}:`, error);
    }

    return pattern;
  }

  /**
   * Generate CSS variable names from token paths based on detected patterns
   */
  generateCSSVariableName(
    tokenPath: string[],
    pattern: TokenTransformPattern
  ): string[] {
    const variants: string[] = [];

    // Apply case transformation
    const transformed = this.transformCase(
      tokenPath.join(pattern.separator || '-'),
      pattern.caseStyle || 'kebab'
    );

    // Generate with prefix
    if (pattern.prefix) {
      variants.push(`--${pattern.prefix}-${transformed}`);
      variants.push(`--${pattern.prefix}${pattern.separator || '-'}${transformed}`);
    }

    // Generate without prefix
    variants.push(`--${transformed}`);

    // Also try the raw path with common separators
    const rawPath = tokenPath.join('-').toLowerCase();
    variants.push(`--${rawPath}`);

    if (pattern.prefix) {
      variants.push(`--${pattern.prefix}-${rawPath}`);
    }

    // Remove duplicates
    return [...new Set(variants)];
  }

  /**
   * Transform string case based on style
   */
  private transformCase(str: string, style: TokenTransformPattern['caseStyle']): string {
    switch (style) {
      case 'kebab':
        return str
          .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
          .replace(/[\s_.]+/g, '-')
          .toLowerCase();

      case 'camel':
        return str
          .replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
          .replace(/^./, char => char.toLowerCase());

      case 'snake':
        return str
          .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
          .replace(/[-\s.]+/g, '_')
          .toLowerCase();

      case 'pascal':
        return str
          .replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
          .replace(/^./, char => char.toUpperCase());

      case 'constant':
        return str
          .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
          .replace(/[-\s.]+/g, '_')
          .toUpperCase();

      default:
        return str.toLowerCase();
    }
  }

  /**
   * Detect token naming patterns from actual CSS files
   */
  async detectPatternsFromCSS(): Promise<TokenTransformPattern> {
    const pattern: TokenTransformPattern = {
      caseStyle: 'kebab',
      separator: '-'
    };

    try {
      // Look for generated CSS files
      const cssFiles = await glob('**/{tokens,variables,design-tokens}.css', {
        cwd: this.projectPath,
        absolute: false,
        ignore: ['**/node_modules/**']
      });

      for (const cssFile of cssFiles) {
        const content = await fs.readFile(path.join(this.projectPath, cssFile), 'utf-8');

        // Extract CSS custom properties
        const cssVarPattern = /--([\w-]+):/g;
        const matches = [...content.matchAll(cssVarPattern)];

        if (matches.length > 0) {
          // Analyze the naming pattern
          const varNames = matches.map(m => m[1]);

          // Check for common prefixes
          const prefixes = new Map<string, number>();
          for (const name of varNames) {
            const parts = name.split('-');
            if (parts.length > 1) {
              const prefix = parts[0];
              prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
            }
          }

          // Find most common prefix
          let maxCount = 0;
          let commonPrefix = '';
          for (const [prefix, count] of prefixes) {
            if (count > maxCount && count > varNames.length * 0.3) {
              maxCount = count;
              commonPrefix = prefix;
            }
          }

          if (commonPrefix) {
            pattern.prefix = commonPrefix;
          }

          // Detect separator (already defaulted to '-')
          if (varNames.some(n => n.includes('_'))) {
            pattern.separator = '_';
            pattern.caseStyle = 'snake';
          }

          break; // Found pattern, stop searching
        }
      }
    } catch (error) {
      console.warn('Could not detect patterns from CSS:', error);
    }

    return pattern;
  }
}