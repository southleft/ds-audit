import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';

/**
 * Minimal detection of a Style Dictionary setup.
 *
 * The audit only needs the *fact* that Style Dictionary is configured (it is
 * reported as an informational finding). All former transform-pattern
 * guessing has been removed: token names are now matched exactly against
 * parsed definitions, so no name-shape inference is needed.
 */
export class StyleDictionaryDetector {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Returns evidence that Style Dictionary is in use — a config file path or
   * the string 'package.json dependency' — or null when not detected.
   */
  async detect(): Promise<string | null> {
    // 1. Explicit Style Dictionary config files
    const configFiles = await glob('**/{style-dictionary,sd}.config.{js,mjs,cjs,json}', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**'],
    });
    if (configFiles.length > 0) return configFiles[0];

    // 2. Declared dependency in the root package.json
    try {
      const raw = await fs.readFile(path.join(this.projectPath, 'package.json'), 'utf-8');
      const pkg = JSON.parse(raw);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['style-dictionary']) return 'package.json dependency';
    } catch {
      // No readable root package.json — fall through to content sniffing.
    }

    // 3. Generic config/build scripts that reference Style Dictionary
    const candidates = await glob('**/{config,build}.{js,mjs,cjs}', {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**'],
    });
    for (const file of candidates.slice(0, 20)) {
      try {
        const content = await fs.readFile(path.join(this.projectPath, file), 'utf-8');
        if (/StyleDictionary|style-dictionary/.test(content)) return file;
      } catch {
        // Unreadable candidate — skip it.
      }
    }

    return null;
  }
}
