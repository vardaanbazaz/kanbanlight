import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { table } from 'table';
import { format, formatDistanceToNow } from 'date-fns';
import { BoardService } from '../services/BoardService';
import { SyncService } from '../services/SyncService';

const boardService = new BoardService();
const syncService = new SyncService(boardService);

export async function createBoard(options: { name?: string }) {
  const spinner = ora('Creating new board...').start();
  
  try {
    const boardName = options.name || 'Main Board';
    const board = await boardService.createBoard(boardName);
    
    // Switch to the new board
    await boardService.switchBoard(board.id);
    
    spinner.succeed(chalk.green(`✅ Created and switched to board "${boardName}"`));
    console.log(chalk.gray(`Board ID: ${board.id}`));
  } catch (error) {
    spinner.fail(chalk.red(`❌ Failed to create board: ${(error as Error).message}`));
  }
}

export async function listBoards() {
  const spinner = ora('Loading boards...').start();
  
  try {
    const boards = await boardService.getBoards();
    const activeBoard = await boardService.getActiveBoard();
    
    spinner.stop();
    
    if (boards.length === 0) {
      console.log(chalk.gray('No boards found. Create one with "kb init"'));
      return;
    }

    const tableData = [
      ['', 'Name', 'Created', 'Updated', 'Branch']
    ];

    for (const board of boards) {
      const isActive = activeBoard?.id === board.id;
      tableData.push([
        isActive ? chalk.green('*') : ' ',
        isActive ? chalk.green(board.name) : board.name,
        formatDistanceToNow(board.createdAt, { addSuffix: true }),
        formatDistanceToNow(board.updatedAt, { addSuffix: true }),
        board.parentBranch || 'main'
      ]);
    }

    console.log(table(tableData));
    
    if (activeBoard) {
      console.log(chalk.blue(`\nActive board: ${activeBoard.name}`));
    }
  } catch (error) {
    spinner.fail(chalk.red(`❌ Failed to list boards: ${(error as Error).message}`));
  }
}

export async function switchBoard(boardName: string) {
  const spinner = ora(`Switching to board "${boardName}"...`).start();
  
  try {
    const boards = await boardService.getBoards();
    const targetBoard = boards.find(b => 
      b.name.toLowerCase() === boardName.toLowerCase() || 
      b.id === boardName
    );
    
    if (!targetBoard) {
      spinner.fail(chalk.red(`❌ Board "${boardName}" not found`));
      return;
    }

    await boardService.switchBoard(targetBoard.id);
    spinner.succeed(chalk.green(`✅ Switched to board "${targetBoard.name}"`));
  } catch (error) {
    spinner.fail(chalk.red(`❌ Failed to switch board: ${(error as Error).message}`));
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
    const activeBoard = await boardService.getActiveBoard();
    if (!activeBoard) {
      spinner.fail(chalk.red('❌ No active board. Use "kb checkout <board>" first'));
      return;
    }

    const card = await boardService.createCard({
      boardId: activeBoard.id,
      title,
      description: options.description,
      priority: (options.priority as any) || 'medium',
      assignee: options.assignee,
      column: options.column || 'backlog',
      position: 0,
      tags: []
    });

    spinner.succeed(chalk.green(`✅ Created card "${title}"`));
    console.log(chalk.gray(`Card ID: ${card.id}`));
    console.log(chalk.gray(`Column: ${card.column}`));
    console.log(chalk.gray(`Priority: ${card.priority}`));
    if (card.assignee) {
      console.log(chalk.gray(`Assignee: ${card.assignee}`));
    }
  } catch (error) {
    spinner.fail(chalk.red(`❌ Failed to create card: ${(error as Error).message}`));
  }
}

export async function listCards(options: {
  column?: string;
  assignee?: string;
  priority?: string;
}) {
  const spinner = ora('Loading cards...').start();
  
  try {
    const activeBoard = await boardService.getActiveBoard();
    if (!activeBoard) {
      spinner.fail(chalk.red('❌ No active board. Use "kb checkout <board>" first'));
      return;
    }

    const cards = await boardService.getCards(activeBoard.id, options);
    spinner.stop();

    if (cards.length === 0) {
      console.log(chalk.gray('No cards found. Create one with "kb add <title>"'));
      return;
    }

    // Group cards by column
    const cardsByColumn = cards.reduce((acc, card) => {
      if (!acc[card.column]) acc[card.column] = [];
      acc[card.column].push(card);
      return acc;
    }, {} as Record<string, typeof cards>);

    for (const [column, columnCards] of Object.entries(cardsByColumn)) {
      console.log(chalk.blue(`\n📋 ${column.toUpperCase()} (${columnCards.length})`));
      
      const tableData = [
        ['ID', 'Title', 'Priority', 'Assignee', 'Updated']
      ];

      for (const card of columnCards) {
        const priorityColor = {
          high: chalk.red,
          medium: chalk.yellow,
          low: chalk.green
        }[card.priority] || chalk.gray;

        tableData.push([
          card.id.substring(0, 8),
          card.title.length > 40 ? card.title.substring(0, 37) + '...' : card.title,
          priorityColor(card.priority),
          card.assignee || '-',
          formatDistanceToNow(card.updatedAt, { addSuffix: true })
        ]);
      }

      console.log(table(tableData));
    }
  } catch (error) {
    spinner.fail(chalk.red(`❌ Failed to list cards: ${(error as Error).message}`));
  }
}

export async function moveCard(cardId: string, column: string) {
  const spinner = ora(`Moving card to ${column}...`).start();
  
  try {
    await boardService.moveCard(cardId, column);
    spinner.succeed(chalk.green(`✅ Moved card to "${column}"`));
  } catch (error) {
    spinner.fail(chalk.red(`❌ Failed to move card: ${(error as Error).message}`));
  }
}

export async function showStatus() {
  const spinner = ora('Checking board status...').start();
  
  try {
    const activeBoard = await boardService.getActiveBoard();
    if (!activeBoard) {
      spinner.fail(chalk.red('❌ No active board'));
      return;
    }

    const cards = await boardService.getCards(activeBoard.id);
    const recentEvents = await boardService.getEvents(activeBoard.id, 5);
    
    spinner.stop();

    console.log(chalk.blue(`📊 Board Status: ${activeBoard.name}`));
    console.log(chalk.gray(`Last updated: ${formatDistanceToNow(activeBoard.updatedAt, { addSuffix: true })}`));

    // Card summary
    const cardsByColumn = cards.reduce((acc, card) => {
      acc[card.column] = (acc[card.column] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(chalk.blue('\n📋 Cards by Column:'));
    for (const [column, count] of Object.entries(cardsByColumn)) {
      console.log(chalk.gray(`  ${column}: ${count}`));
    }

    // Recent activity
    if (recentEvents.length > 0) {
      console.log(chalk.blue('\n📝 Recent Activity:'));
      for (const event of recentEvents) {
        const timeAgo = formatDistanceToNow(event.timestamp, { addSuffix: true });
        console.log(chalk.gray(`  ${event.type} ${timeAgo} by ${event.userId}`));
      }
    }

    // Sync status
    const syncStatus = await syncService.getStatus();
    if (syncStatus.ahead > 0 || syncStatus.behind > 0) {
      console.log(chalk.blue('\n🔄 Sync Status:'));
      if (syncStatus.ahead > 0) {
        console.log(chalk.yellow(`  ${syncStatus.ahead} changes ahead of remote`));
      }
      if (syncStatus.behind > 0) {
        console.log(chalk.yellow(`  ${syncStatus.behind} changes behind remote`));
      }
    }
  } catch (error) {
    spinner.fail(chalk.red(`❌ Failed to get status: ${(error as Error).message}`));
  }
}

export async function showHistory(options: { number?: string; oneline?: boolean }) {
  const spinner = ora('Loading history...').start();
  
  try {
    const activeBoard = await boardService.getActiveBoard();
    if (!activeBoard) {
      spinner.fail(chalk.red('❌ No active board'));
      return;
    }

    const limit = parseInt(options.number || '10');
    const events = await boardService.getEvents(activeBoard.id, limit);
    
    spinner.stop();

    if (events.length === 0) {
      console.log(chalk.gray('No history found'));
      return;
    }

    console.log(chalk.blue(`📜 Board History (${events.length} events)`));

    for (const event of events) {
      const timestamp = format(event.timestamp, 'MMM dd HH:mm');
      const eventId = event.id.substring(0, 8);
      
      if (options.oneline) {
        console.log(`${chalk.yellow(eventId)} ${timestamp} ${event.type} ${chalk.gray(`(${event.userId})`)}`);
      } else {
        console.log(chalk.yellow(`\nCommit ${eventId}`));
        console.log(chalk.gray(`Date: ${timestamp}`));
        console.log(chalk.gray(`User: ${event.userId}`));
        console.log(`Type: ${event.type}`);
        
        if (event.payload && Object.keys(event.payload).length > 0) {
          console.log(chalk.gray('Changes:'));
          console.log(chalk.gray(`  ${JSON.stringify(event.payload, null, 2).replace(/\n/g, '\n  ')}`));
        }
      }
    }
  } catch (error) {
    spinner.fail(chalk.red(`❌ Failed to show history: ${(error as Error).message}`));
  }
}

export async function createBranch(name: string, options: { checkout?: boolean }) {
  const spinner = ora(`Creating branch "${name}"...`).start();
  
  try {
    const activeBoard = await boardService.getActiveBoard();
    if (!activeBoard) {
      spinner.fail(chalk.red('❌ No active board to branch from'));
      return;
    }

    const branch = await boardService.createBoard(
      `${activeBoard.name} (${name})`,
      `Branch of ${activeBoard.name}`,
      activeBoard.id
    );

    if (options.checkout) {
      await boardService.switchBoard(branch.id);
      spinner.succeed(chalk.green(`✅ Created and switched to branch "${name}"`));
    } else {
      spinner.succeed(chalk.green(`✅ Created branch "${name}"`));
      console.log(chalk.gray(`Use "kb checkout ${name}" to switch to it`));
    }
  } catch (error) {
    spinner.fail(chalk.red(`❌ Failed to create branch: ${(error as Error).message}`));
  }
}

export async function mergeBranch(branchName: string, options: { noFf?: boolean }) {
  const spinner = ora(`Merging branch "${branchName}"...`).start();
  
  try {
    const activeBoard = await boardService.getActiveBoard();
    if (!activeBoard) {
      spinner.fail(chalk.red('❌ No active board'));
      return;
    }

    const boards = await boardService.getBoards();
    const sourceBranch = boards.find(
      b => b.name.toLowerCase() === branchName.toLowerCase() || b.id === branchName
    );

    if (!sourceBranch) {
      spinner.fail(chalk.red(`❌ Branch "${branchName}" not found`));
      return;
    }

    await boardService.logEvent(activeBoard.id, 'BRANCH_MERGED', {
      sourceBranchId: sourceBranch.id,
      targetBranchId: activeBoard.id,
      noFf: options.noFf || false,
    }, 'cli-user');

    spinner.succeed(chalk.green(`✅ Merged branch "${sourceBranch.name}" into "${activeBoard.name}"`));
  } catch (error) {
    spinner.fail(chalk.red(`❌ Failed to merge branch: ${(error as Error).message}`));
  }
}

export async function syncBoard(options: { force?: boolean }) {
  const spinner = ora('Syncing with remotes...').start();
  
  try {
    await syncService.syncWithRemote('origin', options.force);
    spinner.succeed(chalk.green('✅ Sync completed'));
  } catch (error) {
    spinner.fail(chalk.red(`❌ Sync failed: ${(error as Error).message}`));
    
    if (!options.force) {
      console.log(chalk.gray('Use --force to override conflicts'));
    }
  }
}