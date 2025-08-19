import type { TokenInfo } from '../types/index.js';

export interface ParsedToken {
  name: string;
  value: string | number;
  type?: string;
  description?: string;
  $extensions?: Record<string, any>;
  aliasOf?: string;
}

export interface TokenSet {
  tokens: Map<string, ParsedToken>;
  aliases: Map<string, string>; // alias name -> referenced token
}

export class TokenParser {
  // Common patterns for token references
  private static readonly REFERENCE_PATTERNS = [
    /^\{([^}]+)\}$/, // Style Dictionary: {colors.primary}
    /^\$([a-zA-Z0-9-_.]+)$/, // Sass variable: $color-primary
    /^var\(--([^)]+)\)$/, // CSS variable: var(--color-primary)
  ];

  // Keys that indicate metadata rather than actual tokens
  private static readonly METADATA_KEYS = [
    '$figmavariablereferences',
    '$figmacollectionid',
    '$figmavariableid',
    'figma',
    'meta',
    'metadata',
    '_meta',
    '$extensions',
    '$type',
    '$description'
  ];

  /**
   * Parse tokens from JSON content with proper handling of:
   * - Token references/aliases
   * - Figma metadata
   * - Nested structures
   */
  static parseJSON(content: string, filePath: string): TokenInfo[] {
    try {
      const data = JSON.parse(content);
      const tokenSet = this.extractTokens(data);
      
      // Resolve aliases and count references
      const resolvedTokens = this.resolveTokenReferences(tokenSet);
      
      // Convert to TokenInfo format
      return this.convertToTokenInfo(resolvedTokens, filePath);
    } catch (error) {
      // Error parsing tokens
      return [];
    }
  }

  private static extractTokens(obj: any, prefix: string = ''): TokenSet {
    const tokens = new Map<string, ParsedToken>();
    const aliases = new Map<string, string>();

    this.traverseObject(obj, prefix, tokens, aliases);
    
    return { tokens, aliases };
  }

  private static traverseObject(
    obj: any,
    prefix: string,
    tokens: Map<string, ParsedToken>,
    aliases: Map<string, string>,
    depth: number = 0
  ): void {
    // Prevent excessive nesting
    if (depth > 10) return;

    for (const [key, value] of Object.entries(obj)) {
      // Skip metadata keys
      if (this.METADATA_KEYS.includes(key.toLowerCase())) {
        continue;
      }

      const currentPath = prefix ? `${prefix}.${key}` : key;

      if (this.isTokenObject(value)) {
        // This is a token definition
        const token = this.parseTokenObject(value);
        token.name = currentPath;
        
        // Check if it's an alias
        const aliasTarget = this.detectAlias(token.value);
        if (aliasTarget) {
          aliases.set(currentPath, aliasTarget);
          token.aliasOf = aliasTarget;
        }
        
        tokens.set(currentPath, token);
      } else if (typeof value === 'object' && value !== null) {
        // Nested object - could be a group or a simple token
        if (this.looksLikeSimpleToken(value)) {
          // Simple token (e.g., { "value": "#000000" })
          const token: ParsedToken = {
            name: currentPath,
            value: (value as any).value || value,
            type: (value as any).type || this.inferTokenType(key, (value as any).value || value),
            description: (value as any).description
          };
          
          const aliasTarget = this.detectAlias(token.value);
          if (aliasTarget) {
            aliases.set(currentPath, aliasTarget);
            token.aliasOf = aliasTarget;
          }
          
          tokens.set(currentPath, token);
        } else {
          // Token group - recurse
          this.traverseObject(value, currentPath, tokens, aliases, depth + 1);
        }
      } else if (typeof value === 'string' || typeof value === 'number') {
        // Direct value token
        const token: ParsedToken = {
          name: currentPath,
          value: value,
          type: this.inferTokenType(key, value)
        };
        
        const aliasTarget = this.detectAlias(value);
        if (aliasTarget) {
          aliases.set(currentPath, aliasTarget);
          token.aliasOf = aliasTarget;
        }
        
        tokens.set(currentPath, token);
      }
    }
  }

  private static isTokenObject(value: any): boolean {
    return typeof value === 'object' && 
           value !== null && 
           ('value' in value || '$value' in value);
  }

  private static looksLikeSimpleToken(value: any): boolean {
    if (typeof value !== 'object' || value === null) return false;
    
    const keys = Object.keys(value);
    const tokenKeys = ['value', '$value', 'type', '$type', 'description', '$description'];
    
    // If it has a value key and mostly token-related keys, it's probably a token
    return keys.some(k => k === 'value' || k === '$value') &&
           keys.every(k => tokenKeys.includes(k) || k.startsWith('$'));
  }

  private static parseTokenObject(obj: any): ParsedToken {
    return {
      name: '', // Will be set by caller
      value: obj.value || obj.$value || obj,
      type: obj.type || obj.$type,
      description: obj.description || obj.$description,
      $extensions: obj.$extensions
    };
  }

  private static detectAlias(value: any): string | null {
    if (typeof value !== 'string') return null;
    
    for (const pattern of this.REFERENCE_PATTERNS) {
      const match = value.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  private static inferTokenType(key: string, value: any): string {
    const keyLower = key.toLowerCase();
    const valueStr = String(value).toLowerCase();

    if (keyLower.includes('color') || keyLower.includes('colour') || 
        valueStr.match(/#[0-9a-f]{3,8}|rgb|hsl/i)) {
      return 'color';
    }
    if (keyLower.includes('space') || keyLower.includes('spacing') || 
        keyLower.includes('margin') || keyLower.includes('padding') ||
        keyLower.includes('size') || keyLower.includes('width') || 
        keyLower.includes('height')) {
      return 'spacing';
    }
    if (keyLower.includes('font') || keyLower.includes('text') || 
        keyLower.includes('type') || keyLower.includes('typography')) {
      return 'typography';
    }
    if (keyLower.includes('shadow')) {
      return 'shadow';
    }
    if (keyLower.includes('border') || keyLower.includes('radius')) {
      return 'border';
    }
    return 'other';
  }

  private static resolveTokenReferences(tokenSet: TokenSet): Map<string, ParsedToken> {
    const { tokens, aliases } = tokenSet;
    const resolved = new Map<string, ParsedToken>();
    
    // First pass: copy all tokens
    tokens.forEach((token, name) => {
      resolved.set(name, { ...token });
    });
    
    // Second pass: mark referenced tokens as "used" if they're referenced by other tokens
    aliases.forEach((targetPath, aliasName) => {
      const targetToken = resolved.get(targetPath);
      if (targetToken) {
        // Mark the target token as being referenced
        if (!targetToken.$extensions) {
          targetToken.$extensions = {};
        }
        if (!targetToken.$extensions.referencedBy) {
          targetToken.$extensions.referencedBy = [];
        }
        targetToken.$extensions.referencedBy.push(aliasName);
      }
    });
    
    return resolved;
  }

  private static convertToTokenInfo(
    tokens: Map<string, ParsedToken>, 
    filePath: string
  ): TokenInfo[] {
    const tokenInfos: TokenInfo[] = [];
    
    tokens.forEach((token, name) => {
      // Skip tokens that look like internal Figma metadata
      if (name.toLowerCase().includes('figmavariable') || 
          name.toLowerCase().includes('figmacollection')) {
        return;
      }
      
      // Determine category based on token structure
      let category: TokenInfo['category'] = 'global';
      if (name.includes('semantic') || name.includes('component')) {
        category = 'semantic';
      } else if (token.aliasOf) {
        category = 'semantic'; // Aliases are usually semantic tokens
      }
      
      tokenInfos.push({
        name,
        value: String(token.value),
        type: (token.type || this.inferTokenType(name, token.value)) as TokenInfo['type'],
        category,
        path: filePath,
        usage: 0,
        // Store reference information in the token
        ...(token.$extensions?.referencedBy && {
          referencedBy: token.$extensions.referencedBy
        }),
        ...(token.aliasOf && {
          aliasOf: token.aliasOf
        })
      });
    });
    
    return tokenInfos;
  }

  /**
   * Check if a value in code references a token (including aliases)
   */
  static isTokenReference(value: string): boolean {
    return this.REFERENCE_PATTERNS.some(pattern => pattern.test(value));
  }

  /**
   * Extract the token name from a reference
   */
  static extractTokenReference(value: string): string | null {
    for (const pattern of this.REFERENCE_PATTERNS) {
      const match = value.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }
}