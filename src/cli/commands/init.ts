import { promises as fs } from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { Logger } from '../../utils/Logger.js';
import { AuditConfig, AuditResult } from '../../types/index.js';
import { AuditEngine } from '../../core/AuditEngine.js';
import { ReportGenerator } from '../../core/ReportGenerator.js';
import { DashboardServer } from '../../dashboard/DashboardServer.js';
import { createDefaultConfig } from './config.js';

interface EnvConfig {
  apiKey?: string;
  model?: string;
}

// Helper to load .env file from project directory
async function loadProjectEnv(projectPath: string): Promise<EnvConfig> {
  const envPath = path.join(projectPath, '.env');
  try {
    const envContent = await fs.readFile(envPath, 'utf-8');
    const parsed = dotenv.parse(envContent);
    return {
      apiKey: parsed.ANTHROPIC_API_KEY,
      model: parsed.ANTHROPIC_MODEL
    };
  } catch {
    return {};
  }
}

// Helper to save to .env file in project directory
async function saveToEnv(projectPath: string, apiKey: string, model?: string): Promise<void> {
  const envPath = path.join(projectPath, '.env');
  const envContent = `# Design System Audit Configuration
ANTHROPIC_API_KEY=${apiKey}
${model ? `ANTHROPIC_MODEL=${model}\n` : ''}`;
  
  try {
    // Check if .env exists and append if needed
    let existingContent = '';
    try {
      existingContent = await fs.readFile(envPath, 'utf-8');
      // Remove existing ANTHROPIC_ lines
      existingContent = existingContent
        .split('\n')
        .filter(line => !line.startsWith('ANTHROPIC_API_KEY=') && !line.startsWith('ANTHROPIC_MODEL='))
        .join('\n');
      if (existingContent && !existingContent.endsWith('\n')) {
        existingContent += '\n';
      }
    } catch {
      // File doesn't exist, that's fine
    }
    
    await fs.writeFile(envPath, existingContent + envContent);
  } catch (error) {
    throw new Error(`Failed to save .env file: ${error}`);
  }
}

export async function initCommand(options: any): Promise<void> {
  const logger = new Logger();
  
  try {
    logger.info('Initializing design system audit...');
    
    // Build configuration
    const config = await buildConfiguration(options, logger);
    
    // Save configuration
    await saveConfiguration(config);
    
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
      logger.info('Starting dashboard server...');
      dashboard = new DashboardServer(config, placeholderResults);
      await dashboard.start();
      // Open dashboard to progress page for live monitoring
      if (config.dashboard.autoOpen) {
        const { spawn } = await import('child_process');
        const start = process.platform === 'darwin' ? 'open' :
                      process.platform === 'win32' ? 'start' : 'xdg-open';
        // Add delay to ensure server is ready
        setTimeout(() => {
          const url = `http://localhost:${config.dashboard.port}/#progress`;
          // Use spawn to avoid command injection - pass URL as separate argument
          if (process.platform === 'win32') {
            spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
          } else {
            spawn(start, [url], { detached: true, stdio: 'ignore' });
          }
        }, 1000);
      }
      
      // Wait for dashboard to connect before starting audit
      if (dashboard) {
        logger.info('Waiting for dashboard connection...');
        await new Promise(resolve => {
          const dashboardRef = dashboard!; // We know it's not null here
          const checkConnection = setInterval(() => {
            if (dashboardRef.progressClients.size > 0) {
              clearInterval(checkConnection);
              logger.info('Dashboard connected!');
              resolve(undefined);
            }
          }, 100);
          
          // Timeout after 10 seconds and continue anyway
          setTimeout(() => {
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
        logger.info('Cleared previous audit results');
      }
    } catch {
      // Ignore errors, just continue
    }
    
    // Run audit
    logger.startSpinner('Running audit...');
    const engine = new AuditEngine(config);
    
    // Set up progress tracking
    let totalCategories = Object.values(config.modules).filter(enabled => enabled).length;
    let completedCategories = 0;

    engine.on('audit:start', () => {
      if (dashboard) {
        // Clear old results when starting new audit
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
      logger.updateSpinner(`Auditing ${category}...`);
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
      logger.updateSpinner(`Completed ${category} (Score: ${result.score})`);
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

    engine.on('ai:start', () => {
      logger.updateSpinner('Running AI judge review...');
      dashboard?.sendProgressUpdate({ type: 'ai:start', message: 'AI judge review started...' });
    });

    engine.on('ai:category', (categoryId) => {
      logger.updateSpinner(`AI judge reviewing ${categoryId}...`);
      dashboard?.sendProgressUpdate({
        type: 'ai:category',
        category: categoryId,
        message: `AI judge reviewing ${categoryId}...`,
      });
    });

    engine.on('ai:complete', () => {
      dashboard?.sendProgressUpdate({ type: 'ai:complete', message: 'AI judge review complete' });
    });

    engine.on('ai:error', (error) => {
      logger.updateSpinner('AI judge review failed — continuing with deterministic scores...');
      dashboard?.sendProgressUpdate({
        type: 'ai:error',
        error: error instanceof Error ? error.message : 'AI judge review failed',
      });
    });

    const results = await engine.run();
    logger.stopSpinner();
    logger.success('Audit completed!');

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
    logger.info('Generating reports...');
    const reportGenerator = new ReportGenerator(config);
    await reportGenerator.generate(results);
    
    // Display summary
    displaySummary(results, logger);
    
  } catch (error) {
    logger.stopSpinner();
    logger.error(`Audit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

async function buildConfiguration(options: any, logger: Logger): Promise<AuditConfig> {
  const config = createDefaultConfig(options.path);

  // Look for an existing API key: project .env first, then process env
  const envConfig = await loadProjectEnv(config.projectPath);
  const existingApiKey = envConfig.apiKey || process.env.ANTHROPIC_API_KEY;

  if (existingApiKey) {
    logger.info(envConfig.apiKey
      ? 'Found Anthropic API key in project .env file'
      : 'Found ANTHROPIC_API_KEY in environment');
    config.ai.apiKey = existingApiKey;
    if (envConfig.model) {
      config.ai.model = envConfig.model;
    }
  }

  if (options.interactive !== false) {
    const prompts: any[] = [
      {
        type: 'checkbox',
        name: 'modules',
        message: 'Which modules would you like to audit?',
        choices: [
          { name: 'Components', value: 'components', checked: true },
          { name: 'Design Tokens', value: 'tokens', checked: true },
          { name: 'Documentation', value: 'documentation', checked: true },
          { name: 'Tooling', value: 'tooling', checked: true },
          { name: 'Performance', value: 'performance', checked: true },
          { name: 'Accessibility', value: 'accessibility', checked: true },
          { name: 'AI Readiness (experimental, not weighted)', value: 'aiReadiness', checked: true },
        ],
      },
      {
        type: 'confirm',
        name: 'aiEnabled',
        message: 'Enable AI-powered judge review? (requires Anthropic API key)',
        default: Boolean(existingApiKey),
      },
    ];

    const answers = await inquirer.prompt(prompts);

    // Update config based on answers
    Object.keys(config.modules).forEach(key => {
      config.modules[key as keyof typeof config.modules] = answers.modules.includes(key);
    });

    config.ai.enabled = Boolean(answers.aiEnabled);

    // Only prompt for an API key when AI is enabled and no key was found
    if (config.ai.enabled && !config.ai.apiKey) {
      const { apiKey } = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: 'Enter your Anthropic API key (leave blank to skip and disable AI):',
          mask: '*',
        },
      ]);

      if (apiKey && apiKey.trim().length > 0) {
        const trimmedKey: string = apiKey.trim();
        config.ai.apiKey = trimmedKey;
        await saveToEnv(config.projectPath, trimmedKey, config.ai.model);
        logger.info('API configuration saved to .env file');
      } else {
        config.ai.enabled = false;
        logger.info('No API key provided — AI judge review disabled. Scores will be deterministic only.');
      }
    }

    // Dashboard is always enabled
    config.dashboard.enabled = true;
  } else {
    // Non-interactive: enable AI only when an API key is available
    if (existingApiKey) {
      config.ai.enabled = true;
      logger.info('AI judge review enabled (API key found in environment)');
    } else {
      config.ai.enabled = false;
      logger.info('AI judge review disabled (no ANTHROPIC_API_KEY found). Scores will be deterministic only.');
    }
  }

  return config;
}

async function saveConfiguration(config: AuditConfig): Promise<void> {
  const configPath = path.join(config.projectPath, '.dsaudit.json');
  // Don't save the API key to the JSON config file - it should only be in .env.
  // Deep-copy `ai` so deleting the key doesn't mutate the live config used by the engine.
  const configToSave: AuditConfig = { ...config, ai: { ...config.ai } };
  delete configToSave.ai.apiKey;
  await fs.writeFile(configPath, JSON.stringify(configToSave, null, 2));
}

function displaySummary(results: any, logger: Logger): void {
  logger.log('');
  logger.log(chalk.bold('=== Audit Summary ==='));
  logger.log(`Overall Score: ${chalk.bold(results.overallScore)}/100 (${results.overallGrade})`);
  logger.log('');
  
  logger.log('Category Scores:');
  results.categories.forEach((category: any) => {
    const color = category.score >= 80 ? chalk.green : category.score >= 60 ? chalk.yellow : chalk.red;
    logger.log(`  ${category.name}: ${color(category.score + '/100')} (${category.grade})`);
  });
  
  logger.log('');
  logger.log(`Reports generated in: ${chalk.cyan(results.metadata.outputPath || './audit')}`);
  
  if (results.recommendations.length > 0) {
    logger.log('');
    logger.log(chalk.bold('Top Recommendations:'));
    results.recommendations.slice(0, 3).forEach((rec: any, index: number) => {
      logger.log(`  ${index + 1}. ${rec.title} [${rec.priority}]`);
    });
  }
}