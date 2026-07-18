import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import { Logger } from '../../utils/Logger.js';
import { AuditConfig } from '../../types/index.js';

/**
 * Default audit configuration shared by `dsaudit init` and `dsaudit config --reset`.
 * Note: no AI model is set here — the LLM judge owns the default model, and
 * AI is disabled unless an Anthropic API key is available.
 */
export function createDefaultConfig(projectPath: string = process.cwd()): AuditConfig {
  return {
    projectPath,
    outputPath: './audit',
    includePatterns: ['**/*.{js,jsx,ts,tsx,css,scss,json,md}'],
    excludePatterns: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    modules: {
      components: true,
      tokens: true,
      documentation: true, // Includes governance checks
      tooling: true,
      performance: true,
      accessibility: true,
      aiReadiness: true, // Experimental — reported but not weighted
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
}

interface ConfigOptions {
  show?: boolean;
  reset?: boolean;
}

export async function configCommand(options: ConfigOptions): Promise<void> {
  const logger = new Logger();
  const configPath = path.join(process.cwd(), '.dsaudit.json');

  if (options.show) {
    let content: string;
    try {
      content = await fs.readFile(configPath, 'utf-8');
    } catch {
      logger.error(`No configuration file found at ${configPath}`);
      logger.info(`Run ${chalk.cyan('dsaudit init')} or ${chalk.cyan('dsaudit config --reset')} to create one.`);
      process.exit(1);
      return;
    }

    try {
      const parsed = JSON.parse(content);
      logger.log(chalk.bold(`Configuration (${configPath}):`));
      logger.log(JSON.stringify(parsed, null, 2));
    } catch {
      logger.error(`Configuration file at ${configPath} is not valid JSON.`);
      logger.info(`Run ${chalk.cyan('dsaudit config --reset')} to restore defaults.`);
      process.exit(1);
    }
    return;
  }

  if (options.reset) {
    const defaults = createDefaultConfig('./');
    await fs.writeFile(configPath, JSON.stringify(defaults, null, 2) + '\n');
    logger.success(`Default configuration written to ${configPath}`);
    logger.info(`AI judge review is disabled by default. Set ${chalk.cyan('ai.enabled')} to true and provide ANTHROPIC_API_KEY to enable it.`);
    return;
  }

  // No flags provided — show help for the subcommand
  logger.log(chalk.bold('Usage: dsaudit config [options]'));
  logger.log('');
  logger.log('Options:');
  logger.log(`  ${chalk.cyan('--show')}   Pretty-print .dsaudit.json from the current directory`);
  logger.log(`  ${chalk.cyan('--reset')}  Write the default configuration to .dsaudit.json`);
}
