import chalk from 'chalk';
import ora from 'ora';
import { sendToBridge } from '../services/BridgeClient';

const BRIDGE_DOWN_MESSAGE = 'Bridge not running on 127.0.0.1:8080. Start it in another terminal with: kb serve';

export async function switchBoard(boardName: string) {
  const spinner = ora(`Switching to "${boardName}"...`).start();
  
  try {
    const sent = await sendToBridge({
      type: 'SWITCH_BRANCH',
      payload: boardName
    });

    if (sent) {
      spinner.succeed(chalk.green(`Sent "switch ${boardName}" to the bridge. The board does not confirm commands yet.`));
    } else {
      spinner.fail(chalk.yellow(BRIDGE_DOWN_MESSAGE));
      process.exitCode = 1;
    }
  } catch (error) {
    spinner.fail(chalk.red(`Failed to switch branch: ${(error as Error).message}`));
    process.exitCode = 1;
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
      spinner.succeed(chalk.green(`Sent "add ${title}" to the bridge. The board does not confirm commands yet.`));
    } else {
      spinner.fail(chalk.yellow(BRIDGE_DOWN_MESSAGE));
      process.exitCode = 1;
    }
  } catch (error) {
    spinner.fail(chalk.red(`Failed to create card: ${(error as Error).message}`));
    process.exitCode = 1;
  }
}

export async function createBranch(name: string, options: { checkout?: boolean }) {
  const spinner = ora(`Creating branch "${name}"...`).start();
  
  try {
    const sent = await sendToBridge({
      type: 'CREATE_BRANCH',
      payload: { name, checkout: options.checkout }
    });

    // -b is accepted but sends nothing extra: the board always switches to the new branch.
    if (sent) {
      spinner.succeed(
        chalk.green(
          `Sent "branch ${name}" to the bridge. The board creates it from the current branch and switches to it. The board does not confirm commands yet.`
        )
      );
    } else {
      spinner.fail(chalk.yellow(BRIDGE_DOWN_MESSAGE));
      process.exitCode = 1;
    }
  } catch (error) {
    spinner.fail(chalk.red(`Failed to create branch: ${(error as Error).message}`));
    process.exitCode = 1;
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
      spinner.succeed(chalk.green(`Sent "compare ${targetBranch}" to the bridge. The board does not confirm commands yet.`));
    } else {
      spinner.fail(chalk.yellow(BRIDGE_DOWN_MESSAGE));
      process.exitCode = 1;
    }
  } catch (error) {
    spinner.fail(chalk.red(`Failed to compare branch: ${(error as Error).message}`));
    process.exitCode = 1;
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
      spinner.succeed(chalk.green('Sent "exit-diff" to the bridge. The board does not confirm commands yet.'));
    } else {
      spinner.fail(chalk.yellow(BRIDGE_DOWN_MESSAGE));
      process.exitCode = 1;
    }
  } catch (error) {
    spinner.fail(chalk.red(`Failed to exit diff mode: ${(error as Error).message}`));
    process.exitCode = 1;
  }
}
