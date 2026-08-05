#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { BoardService } from './services/BoardService';
import { GitIntegration } from './services/GitIntegration';
import { SyncService } from './services/SyncService';
import { 
  createBoard, 
  listBoards, 
  switchBoard,
  createCard,
  listCards,
  moveCard,
  showStatus,
  showHistory,
  createBranch,
  mergeBranch,
  syncBoard
} from './commands';

const program = new Command();

program
  .name('kb')
  .description('KanbanLight CLI - Git-paradigm project management')
  .version('1.0.0');

// Board management commands
program
  .command('init')
  .description('Initialize a new Kanban board in current directory')
  .option('-n, --name <name>', 'Board name', 'Main Board')
  .action(createBoard);

program
  .command('boards')
  .alias('ls')
  .description('List all boards')
  .action(listBoards);

program
  .command('checkout <board>')
  .description('Switch to a different board')
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
  .command('list')
  .alias('cards')
  .description('List all cards in current board')
  .option('-c, --column <column>', 'Filter by column')
  .option('-a, --assignee <assignee>', 'Filter by assignee')
  .option('-p, --priority <priority>', 'Filter by priority')
  .action(listCards);

program
  .command('move <cardId> <column>')
  .description('Move a card to different column')
  .action(moveCard);

// Git-like workflow commands
program
  .command('status')
  .description('Show board status and recent changes')
  .action(showStatus);

program
  .command('log')
  .description('Show board change history')
  .option('-n, --number <count>', 'Number of entries to show', '10')
  .option('--oneline', 'Show compact one-line format')
  .action(showHistory);

program
  .command('branch <name>')
  .description('Create a new board branch')
  .option('-b, --checkout', 'Checkout branch after creation')
  .action(createBranch);

program
  .command('merge <branch>')
  .description('Merge branch into current board')
  .option('--no-ff', 'Create merge commit even if fast-forward possible')
  .action(mergeBranch);

// Collaboration commands
program
  .command('sync')
  .description('Sync with remote collaborators')
  .option('-f, --force', 'Force sync even with conflicts')
  .action(syncBoard);

program
  .command('remote')
  .description('Manage remote board connections')
  .option('-a, --add <url>', 'Add remote URL')
  .option('-r, --remove <name>', 'Remove remote')
  .option('-v, --verbose', 'Show remote details')
  .action((options) => {
    console.log(chalk.blue('Remote management:'), options);
  });

// Git hooks integration
program
  .command('hooks')
  .description('Manage Git hooks integration')
  .option('--install', 'Install Git hooks')
  .option('--uninstall', 'Remove Git hooks')
  .action((options) => {
    const gitIntegration = new GitIntegration();
    if (options.install) {
      gitIntegration.installHooks();
    } else if (options.uninstall) {
      gitIntegration.uninstallHooks();
    } else {
      gitIntegration.showHooksStatus();
    }
  });

// AI commands
program
  .command('analyze')
  .description('Run AI analysis on current board')
  .option('--priority', 'Analyze task priorities')
  .option('--workflow', 'Analyze workflow efficiency')
  .option('--predictions', 'Generate completion predictions')
  .action((options) => {
    console.log(chalk.magenta('🧠 AI Analysis:'), options);
    // AI analysis implementation would go here
  });

// Error handling
program.on('command:*', () => {
  console.error(chalk.red('Invalid command: %s\nSee --help for a list of available commands.'), program.args.join(' '));
  process.exit(1);
});

// Parse command line arguments
program.parse();