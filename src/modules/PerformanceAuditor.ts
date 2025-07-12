import { promises as fs } from 'fs';
import path from 'path';
import type { AuditConfig, CategoryResult, Finding } from '../types/index.js';
import { FileScanner } from '../utils/FileScanner.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class PerformanceAuditor {
  private config: AuditConfig;
  private scanner: FileScanner;

  constructor(config: AuditConfig) {
    this.config = config;
    this.scanner = new FileScanner(config);
  }

  async audit(): Promise<CategoryResult> {
    const findings: Finding[] = [];
    const metrics: Record<string, any> = {
      filesScanned: 0,
      bundleSize: 0,
      imageOptimization: {},
      buildTime: 0,
    };

    // Check for build configuration
    const buildConfig = await this.analyzeBuildConfig();
    metrics.buildConfig = buildConfig;

    // Analyze bundle sizes
    const bundleAnalysis = await this.analyzeBundleSize();
    metrics.bundleSize = bundleAnalysis.totalSize;
    metrics.bundles = bundleAnalysis.bundles;

    // Check for image optimization
    const imageAnalysis = await this.analyzeImages();
    metrics.imageOptimization = imageAnalysis;

    // Check for code splitting
    await this.checkCodeSplitting(findings);

    // Check for tree shaking
    await this.checkTreeShaking(findings, buildConfig);

    // Generate findings based on analysis
    this.generateFindings(findings, metrics, bundleAnalysis, imageAnalysis);

    const score = this.calculateScore(findings, metrics);

    return {
      id: 'performance',
      name: 'Performance',
      score,
      grade: this.getGrade(score),
      weight: 0.10,
      findings,
      metrics,
    };
  }

  private async analyzeBuildConfig(): Promise<any> {
    const config: any = {
      webpack: false,
      vite: false,
      rollup: false,
      parcel: false,
      optimizations: [],
    };

    // Check for webpack
    if (await this.scanner.fileExists('webpack.config.js')) {
      config.webpack = true;
      try {
        const content = await this.scanner.readFile('webpack.config.js');
        if (content.includes('optimization')) {
          config.optimizations.push('webpack-optimization');
        }
        if (content.includes('splitChunks')) {
          config.optimizations.push('code-splitting');
        }
      } catch (error) {
        // Error reading webpack config
      }
    }

    // Check for Vite
    if (await this.scanner.fileExists('vite.config.js') || await this.scanner.fileExists('vite.config.ts')) {
      config.vite = true;
      config.optimizations.push('vite-optimization');
    }

    // Check for package.json build scripts
    try {
      const packageJson = JSON.parse(await this.scanner.readFile('package.json'));
      if (packageJson.scripts?.build) {
        config.hasBuildScript = true;
        if (packageJson.scripts.build.includes('--production')) {
          config.optimizations.push('production-build');
        }
      }
    } catch (error) {
      // Error reading package.json
    }

    return config;
  }

  private async analyzeBundleSize(): Promise<any> {
    const bundles: any[] = [];
    let totalSize = 0;

    // Look for build output directories
    const buildDirs = ['dist', 'build', 'out', '.next'];
    
    for (const dir of buildDirs) {
      if (await this.scanner.fileExists(dir)) {
        try {
          const files = await this.scanner.scanFiles(`${dir}/**/*.{js,css}`);
          
          for (const file of files) {
            const stats = await fs.stat(file.absolutePath);
            const bundle = {
              path: file.path,
              size: stats.size,
              type: file.extension === '.js' ? 'javascript' : 'css',
              gzipSize: await this.estimateGzipSize(stats.size),
            };
            bundles.push(bundle);
            totalSize += stats.size;
          }
        } catch (error) {
          // Error scanning build directory
        }
      }
    }

    return {
      totalSize,
      bundles: bundles.sort((a, b) => b.size - a.size),
    };
  }

  private async analyzeImages(): Promise<any> {
    const imageFiles = await this.scanner.scanFiles('**/*.{png,jpg,jpeg,gif,svg,webp}');
    const analysis: {
      totalImages: number;
      totalSize: number;
      largeImages: Array<{ path: string; size: number }>;
      unoptimizedFormats: number;
    } = {
      totalImages: imageFiles.length,
      totalSize: 0,
      largeImages: [],
      unoptimizedFormats: 0,
    };

    for (const file of imageFiles) {
      try {
        const stats = await fs.stat(file.absolutePath);
        analysis.totalSize += stats.size;
        
        // Flag large images (> 200KB)
        if (stats.size > 200 * 1024) {
          analysis.largeImages.push({
            path: file.path,
            size: stats.size,
          });
        }
        
        // Check for unoptimized formats
        if (file.extension === '.png' || file.extension === '.jpg') {
          analysis.unoptimizedFormats++;
        }
      } catch (error) {
        // Error analyzing image
      }
    }

    return analysis;
  }

  private async checkCodeSplitting(findings: Finding[]): Promise<void> {
    // Check for dynamic imports in code
    const jsFiles = await this.scanner.scanFiles('**/*.{js,jsx,ts,tsx}');
    let hasDynamicImports = false;
    
    for (const file of jsFiles.slice(0, 20)) { // Check first 20 files
      try {
        const content = await this.scanner.readFile(file.path);
        if (content.includes('import(') || content.includes('React.lazy')) {
          hasDynamicImports = true;
          break;
        }
      } catch (error) {
        // Error reading file
      }
    }

    if (!hasDynamicImports) {
      findings.push({
        id: 'perf-no-code-splitting',
        type: 'warning',
        message: 'No code splitting detected - consider using dynamic imports',
        severity: 'medium',
        suggestion: 'Use React.lazy() or dynamic import() to split your bundle',
      });
    } else {
      findings.push({
        id: 'perf-code-splitting',
        type: 'success',
        message: 'Code splitting implemented with dynamic imports',
        severity: 'low',
      });
    }
  }

  private async checkTreeShaking(findings: Finding[], buildConfig: any): Promise<void> {
    // Check if tree shaking is likely enabled
    const hasModernBundler = buildConfig.webpack || buildConfig.vite || buildConfig.rollup;
    const hasProductionBuild = buildConfig.optimizations.includes('production-build');
    
    if (hasModernBundler && hasProductionBuild) {
      findings.push({
        id: 'perf-tree-shaking',
        type: 'success',
        message: 'Tree shaking likely enabled with modern bundler',
        severity: 'low',
      });
    } else if (!hasModernBundler) {
      findings.push({
        id: 'perf-no-modern-bundler',
        type: 'warning',
        message: 'No modern bundler detected - tree shaking may not be enabled',
        severity: 'medium',
        suggestion: 'Use Webpack, Vite, or Rollup for optimal bundle optimization',
      });
    }
  }

  private generateFindings(
    findings: Finding[],
    metrics: any,
    bundleAnalysis: any,
    imageAnalysis: any
  ): void {
    // Bundle size findings
    if (bundleAnalysis.totalSize > 1024 * 1024) { // > 1MB
      findings.push({
        id: 'perf-large-bundle',
        type: 'warning',
        message: `Total bundle size is ${(bundleAnalysis.totalSize / 1024 / 1024).toFixed(2)}MB`,
        severity: 'high',
        suggestion: 'Consider code splitting and tree shaking to reduce bundle size',
      });
    }

    // Large individual bundles
    bundleAnalysis.bundles.slice(0, 3).forEach((bundle: any, index: number) => {
      if (bundle.size > 300 * 1024) { // > 300KB
        findings.push({
          id: `perf-large-bundle-${index}`,
          type: 'warning',
          message: `Large bundle: ${bundle.path} (${(bundle.size / 1024).toFixed(0)}KB)`,
          severity: 'medium',
          suggestion: 'Consider splitting this bundle or optimizing its contents',
        });
      }
    });

    // Image optimization findings
    if (imageAnalysis.largeImages.length > 0) {
      findings.push({
        id: 'perf-large-images',
        type: 'warning',
        message: `Found ${imageAnalysis.largeImages.length} large images (>200KB)`,
        severity: 'medium',
        suggestion: 'Optimize images using compression and modern formats (WebP)',
      });
    }

    if (imageAnalysis.unoptimizedFormats > 5) {
      findings.push({
        id: 'perf-image-formats',
        type: 'info',
        message: 'Consider using modern image formats like WebP for better compression',
        severity: 'low',
      });
    }

    // Build configuration findings
    if (!metrics.buildConfig.hasBuildScript) {
      findings.push({
        id: 'perf-no-build-script',
        type: 'warning',
        message: 'No build script found in package.json',
        severity: 'medium',
        suggestion: 'Add a production build script with optimizations',
      });
    }
  }

  private async estimateGzipSize(size: number): Promise<number> {
    // Rough estimate: gzip typically achieves 70-80% compression on text files
    return Math.round(size * 0.3);
  }

  private calculateScore(findings: Finding[], metrics: any): number {
    let score = 100;

    // Deduct points based on findings
    const criticalFindings = findings.filter(f => f.severity === 'critical').length;
    const highFindings = findings.filter(f => f.severity === 'high').length;
    const mediumFindings = findings.filter(f => f.severity === 'medium').length;

    score -= criticalFindings * 20;
    score -= highFindings * 10;
    score -= mediumFindings * 5;

    // Bundle size penalties
    if (metrics.bundleSize > 2 * 1024 * 1024) { // > 2MB
      score -= 20;
    } else if (metrics.bundleSize > 1 * 1024 * 1024) { // > 1MB
      score -= 10;
    }

    // Bonus for optimizations
    if (metrics.buildConfig?.optimizations?.length > 0) {
      score += metrics.buildConfig.optimizations.length * 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  private getGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}