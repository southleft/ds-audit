import type { TokenInfo, TokenRedundancy } from '../types/index.js';
import Color from 'color';

type ColorInstance = ReturnType<typeof Color>;

export class TokenMatcher {
  private colorTokens: Map<string, TokenInfo> = new Map();
  private spacingTokens: Map<string, TokenInfo> = new Map();
  private typographyTokens: Map<string, TokenInfo> = new Map();
  private otherTokens: Map<string, TokenInfo> = new Map();

  constructor(tokens: TokenInfo[]) {
    this.categorizeTokens(tokens);
  }

  private categorizeTokens(tokens: TokenInfo[]): void {
    tokens.forEach(token => {
      switch (token.type) {
        case 'color':
          this.colorTokens.set(token.value.toLowerCase(), token);
          break;
        case 'spacing':
          this.spacingTokens.set(token.value, token);
          break;
        case 'typography':
          this.typographyTokens.set(token.value, token);
          break;
        default:
          this.otherTokens.set(token.value, token);
      }
    });
  }

  findExactMatch(value: string, type?: string): TokenInfo | undefined {
    const normalizedValue = value.trim().toLowerCase();

    if (type === 'color' || this.isColorValue(value)) {
      return this.colorTokens.get(normalizedValue);
    }

    if (type === 'spacing' || this.isSpacingValue(value)) {
      return this.spacingTokens.get(value);
    }

    // Check all token maps
    return this.colorTokens.get(normalizedValue) ||
           this.spacingTokens.get(value) ||
           this.typographyTokens.get(value) ||
           this.otherTokens.get(value);
  }

  findApproximateMatch(value: string, type?: string, threshold: number = 0.9): { token: TokenInfo; similarity: number } | undefined {
    const normalizedValue = value.trim().toLowerCase();

    if (type === 'color' || this.isColorValue(value)) {
      return this.findApproximateColorMatch(normalizedValue, threshold);
    }

    if (type === 'spacing' || this.isSpacingValue(value)) {
      return this.findApproximateSpacingMatch(value, threshold);
    }

    return undefined;
  }

  private findApproximateColorMatch(value: string, threshold: number): { token: TokenInfo; similarity: number } | undefined {
    try {
      const targetColor = Color(value);
      let bestMatch: { token: TokenInfo; similarity: number } | undefined;

      this.colorTokens.forEach((token) => {
        try {
          const tokenColor = Color(token.value);
          const similarity = this.calculateColorSimilarity(targetColor, tokenColor);

          if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
            bestMatch = { token, similarity };
          }
        } catch {
          // Invalid color format, skip
        }
      });

      return bestMatch;
    } catch {
      return undefined;
    }
  }

  private calculateColorSimilarity(color1: ColorInstance, color2: ColorInstance): number {
    // Simple RGB distance calculation
    const rgb1 = color1.rgb().array();
    const rgb2 = color2.rgb().array();

    const distance = Math.sqrt(
      Math.pow(rgb1[0] - rgb2[0], 2) +
      Math.pow(rgb1[1] - rgb2[1], 2) +
      Math.pow(rgb1[2] - rgb2[2], 2)
    );

    // Normalize to 0-1 range
    return 1 - (distance / (Math.sqrt(3) * 255));
  }

  private findApproximateSpacingMatch(value: string, threshold: number): { token: TokenInfo; similarity: number } | undefined {
    const numericValue = this.extractNumericValue(value);
    if (numericValue === null) return undefined;

    let bestMatch: { token: TokenInfo; similarity: number } | undefined;

    this.spacingTokens.forEach((token) => {
      const tokenNumeric = this.extractNumericValue(token.value);
      if (tokenNumeric === null) return;

      const similarity = this.calculateNumericSimilarity(numericValue, tokenNumeric);

      if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { token, similarity };
      }
    });

    return bestMatch;
  }

  private calculateNumericSimilarity(value1: number, value2: number): number {
    const diff = Math.abs(value1 - value2);
    const maxValue = Math.max(value1, value2);

    if (maxValue === 0) return 1;

    return 1 - (diff / maxValue);
  }

  findRedundantTokens(threshold: number = 0.95): TokenRedundancy[] {
    const redundancies: TokenRedundancy[] = [];

    // Check color redundancies
    const colorArray = Array.from(this.colorTokens.values());
    for (let i = 0; i < colorArray.length; i++) {
      for (let j = i + 1; j < colorArray.length; j++) {
        try {
          const color1 = Color(colorArray[i].value);
          const color2 = Color(colorArray[j].value);
          const similarity = this.calculateColorSimilarity(color1, color2);

          if (similarity >= threshold) {
            redundancies.push({
              tokens: [
                { name: colorArray[i].name, value: colorArray[i].value },
                { name: colorArray[j].name, value: colorArray[j].value }
              ],
              type: 'color',
              similarity,
              suggestion: `Consider consolidating ${colorArray[i].name} and ${colorArray[j].name}`
            });
          }
        } catch {
          // Skip invalid colors
        }
      }
    }

    // Check spacing redundancies
    const spacingArray = Array.from(this.spacingTokens.values());
    for (let i = 0; i < spacingArray.length; i++) {
      for (let j = i + 1; j < spacingArray.length; j++) {
        const value1 = this.extractNumericValue(spacingArray[i].value);
        const value2 = this.extractNumericValue(spacingArray[j].value);

        if (value1 !== null && value2 !== null) {
          const similarity = this.calculateNumericSimilarity(value1, value2);

          if (similarity >= threshold) {
            redundancies.push({
              tokens: [
                { name: spacingArray[i].name, value: spacingArray[i].value },
                { name: spacingArray[j].name, value: spacingArray[j].value }
              ],
              type: 'spacing',
              similarity,
              suggestion: `Consider consolidating ${spacingArray[i].name} and ${spacingArray[j].name}`
            });
          }
        }
      }
    }

    return redundancies;
  }

  isColorValue(value: string): boolean {
    const colorPatterns = [
      /^#[0-9a-f]{3,8}$/i,
      /^rgb\(/i,
      /^rgba\(/i,
      /^hsl\(/i,
      /^hsla\(/i
    ];

    return colorPatterns.some(pattern => pattern.test(value.trim()));
  }

  isSpacingValue(value: string): boolean {
    const spacingPatterns = [
      /^\d+(\.\d+)?(px|rem|em|%|vh|vw|ch|ex)$/,
      /^calc\(/i
    ];

    return spacingPatterns.some(pattern => pattern.test(value.trim()));
  }

  private extractNumericValue(value: string): number | null {
    const match = value.match(/^(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  }

  getAllTokensByType(type: string): TokenInfo[] {
    switch (type) {
      case 'color':
        return Array.from(this.colorTokens.values());
      case 'spacing':
        return Array.from(this.spacingTokens.values());
      case 'typography':
        return Array.from(this.typographyTokens.values());
      default:
        return Array.from(this.otherTokens.values());
    }
  }
}