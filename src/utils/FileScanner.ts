import { glob } from 'glob';
import { promises as fs } from 'fs';
import path from 'path';
import type { AuditConfig } from '../types/index.js';

export interface FileInfo {
  path: string;
  absolutePath: string;
  size: number;
  extension: string;
  directory: string;
  name: string;
}

export interface ProjectInfo {
  type: 'react' | 'vue' | 'angular' | 'svelte' | 'unknown';
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'unknown';
  hasTypeScript: boolean;
  hasStorybook: boolean;
  hasTests: boolean;
  frameworkVersion?: string;
  dependencies: string[];
}

export class FileScanner {
  private config: AuditConfig;
  private cache: Map<string, FileInfo[]> = new Map();

  constructor(config: AuditConfig) {
    this.config = config;
  }

  async scanFiles(patterns: string | string[]): Promise<FileInfo[]> {
    const patternArray = Array.isArray(patterns) ? patterns : [patterns];
    const allFiles: FileInfo[] = [];

    for (const pattern of patternArray) {
      const cacheKey = `${this.config.projectPath}:${pattern}`;
      
      if (this.cache.has(cacheKey)) {
        allFiles.push(...this.cache.get(cacheKey)!);
        continue;
      }

      const files = await glob(pattern, {
        cwd: this.config.projectPath,
        ignore: this.config.excludePatterns,
        absolute: false,
      });

      const fileInfos = await Promise.all(
        files.map(async (file) => this.getFileInfo(file))
      );

      this.cache.set(cacheKey, fileInfos);
      allFiles.push(...fileInfos);
    }

    return allFiles;
  }

  private async getFileInfo(filePath: string): Promise<FileInfo> {
    const absolutePath = path.join(this.config.projectPath, filePath);
    const stats = await fs.stat(absolutePath);

    return {
      path: filePath,
      absolutePath,
      size: stats.size,
      extension: path.extname(filePath),
      directory: path.dirname(filePath),
      name: path.basename(filePath),
    };
  }

  async detectProjectInfo(): Promise<ProjectInfo> {
    const info: ProjectInfo = {
      type: 'unknown',
      packageManager: 'unknown',
      hasTypeScript: false,
      hasStorybook: false,
      hasTests: false,
      dependencies: [],
    };

    // Check for package.json
    try {
      const packageJsonPath = path.join(this.config.projectPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      // Detect framework
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      info.dependencies = Object.keys(deps);

      if (deps.react || deps['react-dom']) {
        info.type = 'react';
        info.frameworkVersion = deps.react || deps['react-dom'];
      } else if (deps.vue) {
        info.type = 'vue';
        info.frameworkVersion = deps.vue;
      } else if (deps['@angular/core']) {
        info.type = 'angular';
        info.frameworkVersion = deps['@angular/core'];
      } else if (deps.svelte) {
        info.type = 'svelte';
        info.frameworkVersion = deps.svelte;
      }

      // Detect TypeScript
      info.hasTypeScript = !!deps.typescript;

      // Detect Storybook
      info.hasStorybook = Object.keys(deps).some(dep => dep.includes('storybook'));

      // Detect test framework
      info.hasTests = !!(deps.jest || deps.vitest || deps.mocha || deps['@testing-library/react']);

    } catch (error) {
      // No package.json found
    }

    // Detect package manager
    const lockFiles = [
      { file: 'package-lock.json', manager: 'npm' as const },
      { file: 'yarn.lock', manager: 'yarn' as const },
      { file: 'pnpm-lock.yaml', manager: 'pnpm' as const },
    ];

    for (const { file, manager } of lockFiles) {
      try {
        await fs.access(path.join(this.config.projectPath, file));
        info.packageManager = manager;
        break;
      } catch {
        // File doesn't exist
      }
    }

    return info;
  }

  async findConfigFiles(): Promise<Record<string, string[]>> {
    const configPatterns: Record<string, string[]> = {
      eslint: ['.eslintrc*', 'eslint.config.*'],
      prettier: ['.prettierrc*', 'prettier.config.*'],
      typescript: ['tsconfig*.json'],
      babel: ['.babelrc*', 'babel.config.*'],
      webpack: ['webpack.config.*'],
      vite: ['vite.config.*'],
      storybook: ['.storybook/**/*'],
      jest: ['jest.config.*'],
      stylelint: ['.stylelintrc*', 'stylelint.config.*'],
    };

    const foundConfigs: Record<string, string[]> = {};

    for (const [tool, patterns] of Object.entries(configPatterns)) {
      const files: string[] = [];
      
      for (const pattern of patterns) {
        const matches = await this.scanFiles(pattern);
        files.push(...matches.map(f => f.path));
      }

      if (files.length > 0) {
        foundConfigs[tool] = files;
      }
    }

    return foundConfigs;
  }

  async readFile(filePath: string): Promise<string> {
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.config.projectPath, filePath);
    
    return fs.readFile(absolutePath, 'utf-8');
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(this.config.projectPath, filePath);
      
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
}