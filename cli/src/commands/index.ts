import chalk from 'chalk';
import ora from 'ora';
import { sendToBridge } from '../services/BridgeClient';

const BRIDGE_DOWN_MESSAGE = '⚠️ CLI Bridge server not running. Run "kb serve" to sync with Live UI.';

export async function switchBoard(boardName: string) {
  const spinner = ora(`Switching to "${boardName}"...`).start();
  
  try {
    const sent = await sendToBridge({
      type: 'SWITCH_BRANCH',
      payload: boardName
    });

    if (sent) {
      spinner.succeed(chalk.green(`✅ Switched to branch "${boardName}" (Live UI Synced)`));
    } else {
      spinner.fail(chalk.yellow(BRIDGE_DOWN_MESSAGE));
      process.exitCode = 1;
    }
  } catch (error) {
    spinner.fail(chalk.red(`❌ Failed to switch branch: ${(error as Error).message}`));
  }
}

export async function createCard(title: string, options: {
  description?: string;
  priority?: string;
  assignee?: string;
  column?: string;
}) {
  const spinner = ora('Creating card...').start();
  
  try {
    const sent = await sendToBridge({
      type: 'CREATE_CARD',
      payload: {
        title,
        description: options.description || '',
        priority: options.priority || 'medium',
        assignee: options.assignee || 'You',
        columnId: options.column || 'backlog'
      }
    });

    if (sent) {
      spinner.succeed(chalk.green(`✅ Created card "${title}" (Live UI Synced)`));
    } else {
      spinner.fail(chalk.yellow(BRIDGE_DOWN_MESSAGE));
      process.exitCode = 1;
    }
  } catch (error) {
    spinner.fail(chalk.red(`❌ Failed to create card: ${(error as Error).message}`));
  }
}

export async function createBranch(name: string, options: { checkout?: boolean }) {
  const spinner = ora(`Creating branch "${name}"...`).start();
  
  try {
    const sent = await sendToBridge({
      type: 'CREATE_BRANCH',
      payload: { name, checkout: options.checkout }
    });

    if (!sent) {
      spinner.fail(chalk.yellow(BRIDGE_DOWN_MESSAGE));
      process.exitCode = 1;
      return;
    }

    if (options.checkout) {
      await sendToBridge({ type: 'SWITCH_BRANCH', payload: name });
      spinner.succeed(chalk.green(`✅ Created and checked out branch "${name}" (Live UI Synced)`));
    } else {
      spinner.succeed(chalk.green(`✅ Created branch "${name}" (Live UI Synced)`));
    }
  } catch (error) {
    spinner.fail(chalk.red(`❌ Failed to create branch: ${(error as Error).message}`));
  }
}

export async function compareBranch(targetBranch: string) {
  const spinner = ora(`Comparing against branch "${targetBranch}"...`).start();
  
  try {
    const sent = await sendToBridge({
      type: 'COMPARE_BRANCH',
      payload: targetBranch
    });

    if (sent) {
      spinner.succeed(chalk.green(`✅ Activated Visual Diff mode against "${targetBranch}" in Live UI`));
    } else {
      spinner.fail(chalk.yellow(`⚠️ CLI Bridge server not running. Run "kb serve" to sync with Live UI.`));
    }
  } catch (error) {
    spinner.fail(chalk.red(`❌ Failed to compare branch: ${(error as Error).message}`));
  }
}

export async function exitDiff() {
  const spinner = ora('Exiting diff mode...').start();
  
  try {
    const sent = await sendToBridge({
      type: 'EXIT_DIFF',
      payload: {}
    });

    if (sent) {
      spinner.succeed(chalk.green('✅ Exited Visual Diff mode in Live UI'));
    } else {
      spinner.stop();
    }
  } catch (error) {
    spinner.fail(chalk.red(`❌ Failed to exit diff mode: ${(error as Error).message}`));
  }
}
