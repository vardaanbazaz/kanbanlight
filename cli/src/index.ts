#!/usr/bin/env node

import { Command } from 'commander';
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
  .version('1.0.0');

// Local Bridge Server command
program
  .command('serve')
  .alias('start')
  .description('Start local WebSocket bridge server to sync with live React UI')
  .option('-p, --port <port>', 'Server port', '8080')
  .action((options) => {
    const port = parseInt(options.port || '8080');
    startCliServer(port);
  });

// Board & Branch management commands
program
  .command('checkout <target>')
  .alias('switch')
  .description('Switch active branch or board')
  .action(switchBoard);

// Card management commands
program
  .command('add <title>')
  .description('Create a new card')
  .option('-d, --description <desc>', 'Card description')
  .option('-p, --priority <priority>', 'Priority (low|medium|high)', 'medium')
  .option('-a, --assignee <assignee>', 'Assignee name')
  .option('-c, --column <column>', 'Target column', 'backlog')
  .action(createCard);

program
  .command('branch <name>')
  .description('Create a new board branch')
  .option('-b, --checkout', 'Checkout branch after creation')
  .action(createBranch);

program
  .command('compare <branch>')
  .alias('diff')
  .description('Compare active branch against target branch in Live UI')
  .action(compareBranch);

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