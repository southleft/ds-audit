#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { initCommand } from './cli/commands/init.js';
import { runCommand } from './cli/commands/run.js';
import { configCommand } from './cli/commands/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const version = packageJson.version;

const program = new Command();

program
  .name('dsaudit')
  .description('CLI-based auditing tool for evaluating design system health')
  .version(version);

program
  .command('init')
  .description('Initialize and run audit on current project directory')
  .option('-p, --path <path>', 'Path to design system directory', process.cwd())
  .option('-c, --config <path>', 'Path to custom config file')
  .option('--no-interactive', 'Run in non-interactive mode with defaults')
  .action(initCommand);

program
  .command('run')
  .description('Run audit with existing configuration')
  .option('-c, --config <path>', 'Path to config file', '.dsaudit.json')
  .option('-o, --output <dir>', 'Output directory for reports')
  .option('--format <formats>', 'Output formats: json,md,html', 'json,md')
  .option('--dashboard', 'Start dashboard after audit')
  .option('--quiet', 'Minimal output')
  .action(runCommand);

program
  .command('config')
  .description('Configure audit settings')
  .option('--show', 'Show current configuration')
  .option('--reset', 'Reset to default configuration')
  .action(configCommand);

program.on('command:*', () => {
  // eslint-disable-next-line no-console
  console.error(chalk.red('Invalid command: %s'), program.args.join(' '));
  // eslint-disable-next-line no-console
  console.log('See --help for a list of available commands.');
  process.exit(1);
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}