import { FileScanner } from '../utils/FileScanner';
import type { AuditConfig } from '../types/index';
import { promises as fs } from 'fs';
import os from 'os';
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

  describe('scanFiles', () => {
    let tmpDir: string;
    let tmpScanner: FileScanner;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsaudit-scanner-'));
      await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'src', 'a.css'), 'a');
      await fs.writeFile(path.join(tmpDir, 'src', 'b.min.css'), 'b');
      await fs.writeFile(path.join(tmpDir, 'src', 'c.ts'), 'c');
      tmpScanner = new FileScanner({ ...config, projectPath: tmpDir, excludePatterns: [] });
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('applies leading-! patterns as exclusions, not as match patterns', async () => {
      // Historically glob returned zero matches for standalone '!' patterns,
      // silently disabling every exclusion auditors thought they had.
      const files = await tmpScanner.scanFiles(['src/**/*.css', '!**/*.min.css']);
      const names = files.map(f => f.name).sort();
      expect(names).toEqual(['a.css']);
    });

    it('dedupes files matched by overlapping patterns', async () => {
      const files = await tmpScanner.scanFiles(['src/**/*.css', 'src/a.css', '**/*.css']);
      const aMatches = files.filter(f => f.name === 'a.css');
      expect(aMatches).toHaveLength(1);
    });

    it('still applies config excludePatterns', async () => {
      const excludingScanner = new FileScanner({
        ...config,
        projectPath: tmpDir,
        excludePatterns: ['**/*.min.css'],
      });
      const files = await excludingScanner.scanFiles(['src/**/*.css']);
      expect(files.map(f => f.name)).toEqual(['a.css']);
    });
  });
});