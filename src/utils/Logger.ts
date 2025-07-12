import chalk from 'chalk';
import ora, { Ora } from 'ora';

export class Logger {
  private spinner: Ora | null = null;

  info(message: string): void {
    if (this.spinner) {
      this.spinner.info(chalk.blue(message));
    } else {
      console.log(chalk.blue('ℹ'), message);
    }
  }

  success(message: string): void {
    if (this.spinner) {
      this.spinner.succeed(chalk.green(message));
    } else {
      console.log(chalk.green('✓'), message);
    }
  }

  warn(message: string): void {
    if (this.spinner) {
      this.spinner.warn(chalk.yellow(message));
    } else {
      console.warn(chalk.yellow('⚠'), message);
    }
  }

  error(message: string): void {
    if (this.spinner) {
      this.spinner.fail(chalk.red(message));
    } else {
      console.error(chalk.red('✗'), message);
    }
  }

  startSpinner(text: string): void {
    this.spinner = ora({
      text: chalk.cyan(text),
      spinner: 'dots',
    }).start();
  }

  updateSpinner(text: string): void {
    if (this.spinner) {
      this.spinner.text = chalk.cyan(text);
    }
  }

  stopSpinner(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  log(message: string): void {
    console.log(message);
  }

  debug(message: string): void {
    if (process.env.DEBUG) {
      console.log(chalk.gray('[DEBUG]'), message);
    }
  }
}