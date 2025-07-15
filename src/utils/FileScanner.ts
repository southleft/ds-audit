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

    // Find ALL package.json files to support monorepos
    try {
      const packageJsonFiles = await this.scanFiles(['**/package.json']);
      
      if (packageJsonFiles.length === 0) {
        return info;
      }
      
      // Aggregate all dependencies from all package.json files
      const allDeps: Record<string, string> = {};
      let frameworkVersion: string | undefined;
      
      for (const file of packageJsonFiles) {
        try {
          const content = await this.readFile(file.path);
          const pkg = JSON.parse(content);
          
          // Merge dependencies
          if (pkg.dependencies) {
            Object.assign(allDeps, pkg.dependencies);
          }
          if (pkg.devDependencies) {
            Object.assign(allDeps, pkg.devDependencies);
          }
        } catch (e) {
          // Skip invalid package.json files
        }
      }

      info.dependencies = Object.keys(allDeps);

      // Detect framework (check all common frameworks)
      if (allDeps.react || allDeps['react-dom']) {
        info.type = 'react';
        info.frameworkVersion = allDeps.react || allDeps['react-dom'];
      } else if (allDeps.vue) {
        info.type = 'vue';
        info.frameworkVersion = allDeps.vue;
      } else if (allDeps['@angular/core']) {
        info.type = 'angular';
        info.frameworkVersion = allDeps['@angular/core'];
      } else if (allDeps.svelte) {
        info.type = 'svelte';
        info.frameworkVersion = allDeps.svelte;
      }

      // Detect TypeScript
      info.hasTypeScript = !!allDeps.typescript;

      // Detect Storybook
      info.hasStorybook = Object.keys(allDeps).some(dep => dep.includes('storybook'));

      // Detect test framework
      info.hasTests = !!(allDeps.jest || allDeps.vitest || allDeps.mocha || allDeps.cypress || allDeps['@testing-library/react']);

    } catch (error) {
      console.error('[FileScanner] Error detecting project info:', error);
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