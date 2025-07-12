import { promises as fs } from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { Logger } from '../../utils/Logger.js';
import { AuditConfig } from '../../types/index.js';
import { AuditEngine } from '../../core/AuditEngine.js';
import { ReportGenerator } from '../../core/ReportGenerator.js';
import { DashboardServer } from '../../dashboard/DashboardServer.js';

export async function initCommand(options: any): Promise<void> {
  const logger = new Logger();
  
  try {
    logger.info('Initializing design system audit...');
    
    // Build configuration
    const config = await buildConfiguration(options, logger);
    
    // Save configuration
    await saveConfiguration(config);
    
    // Run audit
    logger.startSpinner('Running audit...');
    const engine = new AuditEngine(config);
    
    // Set up progress tracking
    engine.on('category:start', (category) => {
      logger.updateSpinner(`Auditing ${category}...`);
    });
    
    engine.on('category:complete', (category, result) => {
      logger.updateSpinner(`Completed ${category} (Score: ${result.score})`);
    });
    
    const results = await engine.run();
    logger.stopSpinner();
    logger.success('Audit completed!');
    
    // Generate reports
    logger.info('Generating reports...');
    const reportGenerator = new ReportGenerator(config);
    await reportGenerator.generate(results);
    
    // Start dashboard if enabled
    if (config.dashboard.enabled) {
      logger.info('Starting dashboard server...');
      const dashboard = new DashboardServer(config, results);
      await dashboard.start();
    }
    
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
      enabled: false,
    },
    dashboard: {
      enabled: true,
      port: 4321,
      autoOpen: true,
    },
  };

  if (options.interactive !== false) {
    const answers = await inquirer.prompt([
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
      {
        type: 'confirm',
        name: 'enableAI',
        message: 'Would you like to enable AI-powered insights? (requires API key)',
        default: false,
      },
      {
        type: 'input',
        name: 'apiKey',
        message: 'Enter your Anthropic API key:',
        when: (answers) => answers.enableAI,
        validate: (input) => input.length > 0 || 'API key is required',
      },
      {
        type: 'confirm',
        name: 'enableDashboard',
        message: 'Would you like to view results in an interactive dashboard?',
        default: true,
      },
    ]);

    // Update config based on answers
    Object.keys(config.modules).forEach(key => {
      config.modules[key as keyof typeof config.modules] = answers.modules.includes(key);
    });

    config.ai.enabled = answers.enableAI;
    if (answers.apiKey) {
      config.ai.apiKey = answers.apiKey;
    }

    config.dashboard.enabled = answers.enableDashboard;
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