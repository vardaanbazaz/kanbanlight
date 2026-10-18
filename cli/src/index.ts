#!/usr/bin/env node

import { Command, InvalidArgumentError, Option } from 'commander';
import chalk from 'chalk';
import { startCliServer } from './server';
import { 
  switchBoard,
  createCard,
  createBranch,
  compareBranch,
  exitDiff
} from './commands';

const program = new Command();

program
  .name('kb')
  .description('KanbanLight CLI - Git-paradigm project management')
  .version('0.0.1')
  .allowExcessArguments(false);

function parsePort(value: string): number {
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) throw new InvalidArgumentError('not a valid port');
  return port;
}

// An empty or whitespace-only value is a usage error (exit 1), never a message to the board.
function required(value: string, what: string): string {
  if (!value.trim()) program.error(`Enter a ${what}.`);
  return value;
}

// Local Bridge Server command
program
  .command('serve')
  .alias('start')
  .description('Start local WebSocket bridge server to sync with live React UI')
  .option('-p, --port <port>', 'Server port', parsePort, 8080)
  .action((options: { port: number }) => {
    startCliServer(options.port);
  });

// Board & Branch management commands
program
  .command('switch <branch>')
  .alias('checkout')
  .description('Switch the board to another branch')
  .action((branch: string) => switchBoard(required(branch, 'branch name')));

// Card management commands
program
  .command('add <title>')
  .description('Create a new card')
  .option('-d, --description <desc>', 'Card description')
  .addOption(new Option('-p, --priority <priority>', 'Priority').choices(['low', 'medium', 'high']).default('medium'))
  .option('-a, --assignee <assignee>', 'Assignee name')
  .addOption(
    new Option('-c, --column <column>', 'Target column')
      .choices(['backlog', 'todo', 'in-progress', 'review', 'done'])
      .default('backlog')
  )
  .action((title: string, options: Parameters<typeof createCard>[1]) =>
    createCard(required(title, 'card title'), options)
  );

program
  .command('branch <name>')
  .description('Create a branch from the current branch and switch to it')
  .option('-b, --checkout', '(no effect: the board always switches to the new branch)')
  .action((name: string, options: { checkout?: boolean }) => createBranch(required(name, 'branch name'), options));

program
  .command('compare <branch>')
  .alias('diff')
  .description('Compare active branch against target branch in Live UI')
  .action((branch: string) => compareBranch(required(branch, 'branch name')));

program
  .command('exit-diff')
  .description('Exit Visual Diff mode in Live UI')
  .action(exitDiff);

// Error handling
program.on('command:*', () => {
  console.error(chalk.red('Invalid command: %s\nSee --help for a list of available commands.'), program.args.join(' '));
  process.exit(1);
});

// Parse command line arguments
program.parse(process.argv);