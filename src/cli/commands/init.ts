import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import inquirer from 'inquirer';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { Logger } from '../../utils/Logger.js';
import { AuditConfig, AuditResult } from '../../types/index.js';
import { AuditEngine } from '../../core/AuditEngine.js';
import { ReportGenerator } from '../../core/ReportGenerator.js';
import { DashboardServer } from '../../dashboard/DashboardServer.js';

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
      model: parsed.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
    };
  } catch {
    return {};
  }
}

// Helper to save to .env file in project directory
async function saveToEnv(projectPath: string, apiKey: string, model: string): Promise<void> {
  const envPath = path.join(projectPath, '.env');
  const envContent = `# Design System Audit Configuration
ANTHROPIC_API_KEY=${apiKey}
ANTHROPIC_MODEL=${model}
`;
  
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
    }

    // Run audit
    logger.startSpinner('Running audit...');
    const engine = new AuditEngine(config);
    
    // Set up progress tracking
    let totalCategories = Object.values(config.modules).filter(enabled => enabled).length;
    let completedCategories = 0;

    engine.on('audit:start', () => {
      if (dashboard) {
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
  const config: AuditConfig = {
    projectPath: options.path,
    outputPath: './audit',
    includePatterns: ['**/*.{js,jsx,ts,tsx,css,scss,json,md}'],
    excludePatterns: ['**/node_modules/**', '**/dist/**', '**/build/**'],
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
      enabled: true,  // AI is always enabled
      model: 'claude-sonnet-4-20250514',
    },
    dashboard: {
      enabled: true,
      port: 4321,
      autoOpen: true,
    },
  };

  // Load existing .env if available
  const envConfig = await loadProjectEnv(config.projectPath);
  
  if (envConfig.apiKey) {
    logger.info('Using API configuration from .env file');
    config.ai.apiKey = envConfig.apiKey;
    config.ai.model = envConfig.model || 'claude-sonnet-4-20250514';
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
          { name: 'Governance', value: 'governance', checked: true },
          { name: 'Tooling', value: 'tooling', checked: true },
          { name: 'Performance', value: 'performance', checked: true },
          { name: 'Accessibility', value: 'accessibility', checked: true },
        ],
      },
    ];
    
    // Only prompt for API key if not found in .env
    if (!config.ai.apiKey) {
      prompts.push({
        type: 'password',
        name: 'apiKey',
        message: 'Enter your Anthropic API key:',
        mask: '*',
        validate: (input: string) => input.length > 0 || 'API key is required',
      });
    }
    
    const answers = await inquirer.prompt(prompts);

    // Update config based on answers
    Object.keys(config.modules).forEach(key => {
      config.modules[key as keyof typeof config.modules] = answers.modules.includes(key);
    });

    // Save API key to .env if provided
    if (answers.apiKey) {
      config.ai.apiKey = answers.apiKey;
      await saveToEnv(config.projectPath, answers.apiKey, config.ai.model!);
      logger.info('API configuration saved to .env file');
    }

    // Dashboard is always enabled
    config.dashboard.enabled = true;
  }

  return config;
}

async function saveConfiguration(config: AuditConfig): Promise<void> {
  const configPath = path.join(config.projectPath, '.dsaudit.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
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