import { FileScanner } from '../utils/FileScanner';
import type { AuditConfig } from '../types/index';
import { promises as fs } from 'fs';
import path from 'path';

describe('FileScanner', () => {
  let scanner: FileScanner;
  let config: AuditConfig;

  beforeEach(() => {
    config = {
      projectPath: process.cwd(),
      outputPath: './audit',
      includePatterns: ['**/*.{js,ts}'],
      excludePatterns: ['**/node_modules/**'],
      modules: {
        components: true,
        tokens: true,
        documentation: true,
        governance: true,
        tooling: true,
        performance: true,
        accessibility: true,
      },
      ai: {
        enabled: false,
      },
      dashboard: {
        enabled: true,
        port: 4321,
        autoOpen: false,
      },
    };
    scanner = new FileScanner(config);
  });

  describe('fileExists', () => {
    it('should return true for existing files', async () => {
      const exists = await scanner.fileExists('package.json');
      expect(exists).toBe(true);
    });

    it('should return false for non-existing files', async () => {
      const exists = await scanner.fileExists('non-existent-file.txt');
      expect(exists).toBe(false);
    });
  });

  describe('detectProjectInfo', () => {
    it('should detect project type and dependencies', async () => {
      const info = await scanner.detectProjectInfo();
      
      expect(info.type).toBeDefined();
      expect(info.packageManager).toBeDefined();
      expect(info.hasTypeScript).toBe(true); // Since this is a TypeScript project
      expect(info.dependencies).toBeInstanceOf(Array);
    });
  });

  describe('findConfigFiles', () => {
    it('should find configuration files', async () => {
      const configs = await scanner.findConfigFiles();
      
      // This project should have TypeScript and Jest configs
      expect(configs.typescript).toBeDefined();
      expect(configs.typescript?.length).toBeGreaterThan(0);
      expect(configs.jest).toBeDefined();
    });
  });
});