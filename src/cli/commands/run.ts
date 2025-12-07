import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { Logger } from '../../utils/Logger.js';
import { AuditConfig, AuditResult } from '../../types/index.js';
import { AuditEngine } from '../../core/AuditEngine.js';
import { ReportGenerator } from '../../core/ReportGenerator.js';
import { DashboardServer } from '../../dashboard/DashboardServer.js';

interface RunOptions {
  config?: string;
  output?: string;
  format?: string;
  dashboard?: boolean;
  quiet?: boolean;
}

// Helper to load .env file from project directory
async function loadProjectEnv(projectPath: string): Promise<{ apiKey?: string; model?: string }> {
  const envPath = path.join(projectPath, '.env');
  try {
    const envContent = await fs.readFile(envPath, 'utf-8');
    const parsed = dotenv.parse(envContent);
    return {
      apiKey: parsed.ANTHROPIC_API_KEY,
      model: parsed.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
    };
  } catch {
    return {};
  }
}

export async function runCommand(options: RunOptions): Promise<void> {
  const logger = new Logger();

  try {
    // Determine config file path
    const configPath = options.config
      ? path.resolve(process.cwd(), options.config)
      : path.join(process.cwd(), '.dsaudit.json');

    // Check if config exists
    try {
      await fs.access(configPath);
    } catch {
      logger.error(`Configuration file not found: ${configPath}`);
      logger.info('');
      logger.info('To create a configuration file, run:');
      logger.info(chalk.cyan('  dsaudit init'));
      process.exit(1);
    }

    // Load configuration
    if (!options.quiet) {
      logger.info(`Loading configuration from ${chalk.cyan(configPath)}...`);
    }

    const configContent = await fs.readFile(configPath, 'utf-8');
    let config: AuditConfig;

    try {
      config = JSON.parse(configContent);
    } catch (error) {
      logger.error('Failed to parse configuration file');
      logger.error(error instanceof Error ? error.message : 'Invalid JSON');
      process.exit(1);
    }

    // Load API key from .env if available
    const envConfig = await loadProjectEnv(config.projectPath);
    if (envConfig.apiKey && config.ai) {
      config.ai.apiKey = envConfig.apiKey;
      config.ai.model = envConfig.model || config.ai.model;
    }

    // Validate API key if AI is enabled
    if (config.ai?.enabled && !config.ai.apiKey) {
      logger.warn('AI is enabled but no API key found');
      logger.info('Add ANTHROPIC_API_KEY to .env file in project directory, or run:');
      logger.info(chalk.cyan('  dsaudit init'));
      logger.info('');
      logger.info('Continuing without AI insights...');
      config.ai.enabled = false;
    }

    // Override output path if specified
    if (options.output) {
      config.outputPath = options.output;
    }

    // Override dashboard setting if specified
    if (options.dashboard !== undefined) {
      config.dashboard.enabled = options.dashboard;
    }

    // Validate project path exists
    try {
      await fs.access(config.projectPath);
    } catch {
      logger.error(`Project path not found: ${config.projectPath}`);
      process.exit(1);
    }

    if (!options.quiet) {
      logger.info('');
      logger.info(chalk.bold('=== Audit Configuration ==='));
      logger.info(`Project: ${chalk.cyan(config.projectPath)}`);
      logger.info(`Output: ${chalk.cyan(config.outputPath)}`);
      logger.info(`AI Insights: ${config.ai?.enabled ? chalk.green('enabled') : chalk.gray('disabled')}`);

      const enabledModules = Object.entries(config.modules)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name);
      logger.info(`Modules: ${chalk.cyan(enabledModules.join(', '))}`);
      logger.info('');
    }

    // Create a placeholder results object for the dashboard
    const placeholderResults: AuditResult = {
      timestamp: new Date().toISOString(),
      projectPath: config.projectPath,
      overallScore: 0,
      overallGrade: 'N/A',
      categories: [],
      recommendations: [],
      metadata: {
        duration: 0,
        filesScanned: 0,
        toolsDetected: [],
        frameworksDetected: [],
        errors: []
      }
    };

    // Start dashboard server first if enabled
    let dashboard: DashboardServer | null = null;
    if (config.dashboard.enabled) {
      if (!options.quiet) {
        logger.info('Starting dashboard server...');
      }
      dashboard = new DashboardServer(config, placeholderResults);
      await dashboard.start();

      // Open dashboard to progress page for live monitoring
      if (config.dashboard.autoOpen) {
        const { spawn } = await import('child_process');
        const start = process.platform === 'darwin' ? 'open' :
                      process.platform === 'win32' ? 'start' : 'xdg-open';
        // Add delay to ensure server is ready
        // eslint-disable-next-line no-undef
        setTimeout(() => {
          const url = `http://localhost:${config.dashboard.port}/#progress`;
          if (process.platform === 'win32') {
            spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
          } else {
            spawn(start, [url], { detached: true, stdio: 'ignore' });
          }
        }, 1000);
      }

      // Wait for dashboard connection before starting audit
      if (dashboard && !options.quiet) {
        logger.info('Waiting for dashboard connection...');
        await new Promise(resolve => {
          const dashboardRef = dashboard!;
          // eslint-disable-next-line no-undef
          const checkConnection = setInterval(() => {
            if (dashboardRef.progressClients.size > 0) {
              // eslint-disable-next-line no-undef
              clearInterval(checkConnection);
              logger.info('Dashboard connected!');
              resolve(undefined);
            }
          }, 100);

          // Timeout after 10 seconds and continue anyway
          // eslint-disable-next-line no-undef
          setTimeout(() => {
            // eslint-disable-next-line no-undef
            clearInterval(checkConnection);
            logger.warn('Dashboard connection timeout, continuing anyway');
            resolve(undefined);
          }, 10000);
        });
      }
    }

    // Clear any old audit results before starting
    try {
      const auditDir = path.join(config.projectPath, config.outputPath);
      const resultsPath = path.join(auditDir, 'results.json');
      if (await fs.access(resultsPath).then(() => true).catch(() => false)) {
        await fs.unlink(resultsPath);
        if (!options.quiet) {
          logger.info('Cleared previous audit results');
        }
      }
    } catch {
      // Ignore errors, just continue
    }

    // Run audit
    if (!options.quiet) {
      logger.startSpinner('Running audit...');
    }
    const engine = new AuditEngine(config);

    // Set up progress tracking
    const totalCategories = Object.values(config.modules).filter(enabled => enabled).length;
    let completedCategories = 0;

    engine.on('audit:start', () => {
      if (dashboard) {
        dashboard.results = {
          timestamp: new Date().toISOString(),
          projectPath: config.projectPath,
          overallScore: 0,
          overallGrade: 'N/A',
          categories: [],
          recommendations: [],
          metadata: {
            duration: 0,
            filesScanned: 0,
            toolsDetected: [],
            frameworksDetected: [],
            errors: []
          }
        };
        dashboard.sendProgressUpdate({
          type: 'audit:start',
          totalCategories,
          message: 'Starting design system audit...'
        });
      }
    });

    engine.on('category:start', (category) => {
      if (!options.quiet) {
        logger.updateSpinner(`Auditing ${category}...`);
      }
      if (dashboard) {
        dashboard.sendProgressUpdate({
          type: 'category:start',
          category,
          progress: Math.round((completedCategories / totalCategories) * 100),
          message: `Auditing ${category}...`
        });
      }
    });

    engine.on('category:complete', (category, result) => {
      completedCategories++;
      if (!options.quiet) {
        logger.updateSpinner(`Completed ${category} (Score: ${result.score})`);
      }
      if (dashboard) {
        dashboard.sendProgressUpdate({
          type: 'category:complete',
          category,
          result,
          progress: Math.round((completedCategories / totalCategories) * 100),
          message: `Completed ${category} (Score: ${result.score})`
        });
      }
    });

    engine.on('category:error', (category, error) => {
      completedCategories++;
      if (dashboard) {
        dashboard.sendProgressUpdate({
          type: 'category:error',
          category,
          error: error.message,
          progress: Math.round((completedCategories / totalCategories) * 100)
        });
      }
    });

    const results = await engine.run();

    if (!options.quiet) {
      logger.stopSpinner();
      logger.success('Audit completed!');
    }

    if (dashboard) {
      dashboard.sendProgressUpdate({
        type: 'audit:complete',
        progress: 100,
        message: 'Audit completed successfully!'
      });
      // Update dashboard with real results
      dashboard.results = results;
    }

    // Generate reports
    const formats = options.format?.split(',') || ['json', 'md'];

    if (!options.quiet) {
      logger.info(`Generating reports (${formats.join(', ')})...`);
    }

    const reportGenerator = new ReportGenerator(config);
    await reportGenerator.generate(results);

    // Display summary unless quiet mode
    if (!options.quiet) {
      displaySummary(results, logger, config);
    }

  } catch (error) {
    logger.stopSpinner();
    logger.error(`Audit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

function displaySummary(results: AuditResult, logger: Logger, config: AuditConfig): void {
  logger.log('');
  logger.log(chalk.bold('=== Audit Summary ==='));
  logger.log(`Overall Score: ${chalk.bold(results.overallScore)}/100 (${results.overallGrade})`);
  logger.log('');

  logger.log('Category Scores:');
  results.categories.forEach((category) => {
    const color = category.score >= 80 ? chalk.green : category.score >= 60 ? chalk.yellow : chalk.red;
    logger.log(`  ${category.name}: ${color(category.score + '/100')} (${category.grade})`);
  });

  logger.log('');
  logger.log(`Reports generated in: ${chalk.cyan(results.metadata.outputPath || config.outputPath)}`);

  if (results.recommendations.length > 0) {
    logger.log('');
    logger.log(chalk.bold('Top Recommendations:'));
    results.recommendations.slice(0, 3).forEach((rec, index) => {
      logger.log(`  ${index + 1}. ${rec.title} [${rec.priority}]`);
    });
  }

  if (config.dashboard.enabled) {
    logger.log('');
    logger.log(`Dashboard: ${chalk.cyan(`http://localhost:${config.dashboard.port}`)}`);
  }
}
