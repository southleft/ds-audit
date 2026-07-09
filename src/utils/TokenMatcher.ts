import type { TokenInfo, TokenRedundancy } from '../types/index.js';
import Color from 'color';

type ColorInstance = ReturnType<typeof Color>;

export interface Dimension {
  num: number;
  unit: string;
}

/**
 * Exact, unit-aware token lookup plus perceptual color comparison.
 *
 * Token sets are typically a few hundred entries, so plain Maps and linear
 * scans are both instant and more correct than indexing shortcuts (no
 * bucket-boundary misses). Matching is deliberately conservative:
 * - names match exactly (case-insensitive),
 * - values match only when the normalized value is identical — colors are
 *   canonicalized (`#FFF` === `#ffffff` === `rgb(255,255,255)`), dimensions
 *   compare number AND unit (`24px` !== `24rem`),
 * - "similar" colors are measured with CIE76 delta-E in Lab space.
 */
export class TokenMatcher {
  private byName = new Map<string, TokenInfo>();
  private byValueKey = new Map<string, TokenInfo>();
  private colorTokens: Array<{ token: TokenInfo; lab: number[] }> = [];
  private dimensionTokens: Array<{ token: TokenInfo; dim: Dimension }> = [];

  private static readonly COLOR_VALUE = /^(#[0-9a-f]{3,8}|rgba?\(.+\)|hsla?\(.+\))$/i;
  private static readonly COLOR_KEYWORD = /^[a-z]{3,25}$/i; // e.g. "white", "rebeccapurple"
  private static readonly DIMENSION_VALUE = /^(-?\d*\.?\d+)(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|pt|ms|s)$/i;

  /** Delta-E at or below this is visually indistinguishable (just-noticeable difference). */
  private static readonly REDUNDANT_DELTA_E = 2.3;

  constructor(tokens: TokenInfo[]) {
    for (const token of tokens) {
      const nameKey = token.name.trim().toLowerCase();
      if (!this.byName.has(nameKey)) {
        this.byName.set(nameKey, token);
      }

      // Alias values (var(--x), {a.b}, $x) are references, not literals —
      // they must not participate in value matching.
      if (token.aliasOf) continue;

      const key = TokenMatcher.valueKey(token.value);
      if (key && !this.byValueKey.has(key)) {
        this.byValueKey.set(key, token);
      }

      const color = TokenMatcher.tryParseColor(token.value);
      if (color) {
        this.colorTokens.push({ token, lab: color.lab().array() });
        continue;
      }

      const dim = TokenMatcher.parseDimension(token.value);
      if (dim) {
        this.dimensionTokens.push({ token, dim });
      }
    }
  }

  /** Exact token lookup by canonical name (case-insensitive). */
  findTokenByName(name: string): TokenInfo | undefined {
    return this.byName.get(name.trim().toLowerCase());
  }

  /**
   * Exact value match, unit-aware. Returns the token whose literal value is
   * the same normalized value, or undefined. Never fuzzy.
   */
  findExactValueMatch(value: string): TokenInfo | undefined {
    const key = TokenMatcher.valueKey(value);
    return key ? this.byValueKey.get(key) : undefined;
  }

  /**
   * Nearest color token by CIE76 delta-E, if within the similarity threshold.
   * similarity = 1 - deltaE / 100 (clamped to 0).
   */
  findSimilarColorToken(
    value: string,
    threshold = 0.95
  ): { token: TokenInfo; similarity: number } | undefined {
    const target = TokenMatcher.tryParseColor(value);
    if (!target) return undefined;

    const targetLab = target.lab().array();
    let best: { token: TokenInfo; similarity: number } | undefined;

    for (const { token, lab } of this.colorTokens) {
      const similarity = TokenMatcher.labSimilarity(targetLab, lab);
      if (similarity >= threshold && (!best || similarity > best.similarity)) {
        best = { token, similarity };
      }
    }

    return best;
  }

  /**
   * Duplicate token detection:
   * - color pairs within delta-E 2.3 (visually indistinguishable),
   * - dimension tokens with the identical number AND unit under different names.
   * Different units are never redundant (24px vs 24rem are different values).
   */
  findRedundantTokens(): TokenRedundancy[] {
    const redundancies: TokenRedundancy[] = [];
    const flagged = new Set<string>();

    // Colors: linear pairwise scan with perceptual distance.
    for (let i = 0; i < this.colorTokens.length; i++) {
      const a = this.colorTokens[i];
      if (flagged.has(a.token.name)) continue;

      for (let j = i + 1; j < this.colorTokens.length; j++) {
        const b = this.colorTokens[j];
        if (flagged.has(b.token.name)) continue;

        const deltaE = TokenMatcher.deltaE(a.lab, b.lab);
        if (deltaE <= TokenMatcher.REDUNDANT_DELTA_E) {
          redundancies.push({
            tokens: [
              { name: a.token.name, value: a.token.value },
              { name: b.token.name, value: b.token.value },
            ],
            type: 'color',
            similarity: Math.max(0, 1 - deltaE / 100),
            suggestion: `Consider consolidating ${a.token.name} and ${b.token.name}`,
          });
          flagged.add(a.token.name);
          flagged.add(b.token.name);
          break;
        }
      }
    }

    // Dimensions: only exact duplicates (same number + unit) are flagged;
    // near values are usually intentional scale steps.
    const byExactValue = new Map<string, Array<{ token: TokenInfo }>>();
    for (const entry of this.dimensionTokens) {
      const key = `${entry.dim.num}${entry.dim.unit}`;
      const list = byExactValue.get(key) || [];
      list.push(entry);
      byExactValue.set(key, list);
    }
    for (const group of byExactValue.values()) {
      if (group.length < 2) continue;
      redundancies.push({
        tokens: group.map(({ token }) => ({ name: token.name, value: token.value })),
        type: group[0].token.type,
        similarity: 1,
        suggestion: `Tokens ${group.map(g => g.token.name).join(', ')} share the value ${group[0].token.value}`,
      });
    }

    return redundancies;
  }

  isColorValue(value: string): boolean {
    return TokenMatcher.COLOR_VALUE.test(value.trim());
  }

  isDimensionValue(value: string): boolean {
    return TokenMatcher.DIMENSION_VALUE.test(value.trim());
  }

  /** Parse "24px" -> { num: 24, unit: "px" }. Returns null for non-dimensions. */
  static parseDimension(value: string): Dimension | null {
    const match = TokenMatcher.DIMENSION_VALUE.exec(value.trim());
    if (!match) return null;
    return { num: parseFloat(match[1]), unit: match[2].toLowerCase() };
  }

  /**
   * Normalized comparison key for a token/style value.
   * Dimensions -> `d:<number><unit>`; colors -> canonical rgba channels;
   * everything else -> lowercased trimmed string.
   */
  private static valueKey(value: string): string | null {
    const v = value.trim().replace(/\s+/g, ' ');
    if (!v) return null;

    const dim = TokenMatcher.parseDimension(v);
    if (dim) return `d:${dim.num}${dim.unit}`;

    const color = TokenMatcher.tryParseColor(v);
    if (color) {
      const [r, g, b] = color.rgb().round().array();
      return `c:${r},${g},${b},${color.alpha()}`;
    }

    return `s:${v.toLowerCase()}`;
  }

  private static tryParseColor(value: string): ColorInstance | null {
    const v = value.trim();
    // Gate on shape first: dimensions and arbitrary strings must not reach
    // Color(), and only plausible color keywords are attempted.
    if (!TokenMatcher.COLOR_VALUE.test(v) && !TokenMatcher.COLOR_KEYWORD.test(v)) {
      return null;
    }
    try {
      return Color(v.toLowerCase());
    } catch {
      return null;
    }
  }

  private static deltaE(lab1: number[], lab2: number[]): number {
    const dL = lab1[0] - lab2[0];
    const dA = lab1[1] - lab2[1];
    const dB = lab1[2] - lab2[2];
    return Math.sqrt(dL * dL + dA * dA + dB * dB);
  }

  private static labSimilarity(lab1: number[], lab2: number[]): number {
    return Math.max(0, 1 - TokenMatcher.deltaE(lab1, lab2) / 100);
  }
}
