import { execSync, spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

export class GitIntegration {
  private hooksDir: string;
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.hooksDir = path.join(projectRoot, '.git', 'hooks');
  }

  async installHooks(): Promise<void> {
    try {
      // Check if we're in a git repository
      execSync('git rev-parse --git-dir', { cwd: this.projectRoot, stdio: 'ignore' });
    } catch {
      throw new Error('Not a git repository. Run "git init" first.');
    }

    console.log(chalk.blue('📦 Installing KanbanLight Git hooks...'));

    // Install commit-msg hook
    await this.installCommitMsgHook();
    
    // Install post-commit hook
    await this.installPostCommitHook();

    console.log(chalk.green('✅ Git hooks installed successfully!'));
    console.log(chalk.gray('Commit messages will now auto-create Kanban cards when they match patterns like:'));
    console.log(chalk.gray('  - "feat: add user authentication [high]"'));
    console.log(chalk.gray('  - "fix: resolve login bug @alice [urgent]"'));
  }

  private async installCommitMsgHook(): Promise<void> {
    const hookPath = path.join(this.hooksDir, 'commit-msg');
    const hookContent = `#!/bin/sh
# KanbanLight Git Integration - Commit Message Hook

commit_msg_file="$1"
commit_msg=$(cat "$commit_msg_file")

# Extract task information from commit message
# Pattern: type: description [priority] @assignee
if echo "$commit_msg" | grep -qE "^(feat|fix|docs|style|refactor|test|chore):" ; then
    # Parse commit message
    type=$(echo "$commit_msg" | sed -n 's/^\\([^:]*\\):.*/\\1/p')
    description=$(echo "$commit_msg" | sed -n 's/^[^:]*: *\\([^\\[]*\\).*/\\1/p' | sed 's/ *$//')
    
    # Extract priority (default to medium)
    priority="medium"
    if echo "$commit_msg" | grep -qE "\\[(high|medium|low|urgent)\\]" ; then
        priority=$(echo "$commit_msg" | sed -n 's/.*\\[\\(high\\|medium\\|low\\|urgent\\)\\].*/\\1/p')
        if [ "$priority" = "urgent" ]; then
            priority="high"
        fi
    fi
    
    # Extract assignee
    assignee=""
    if echo "$commit_msg" | grep -qE "@[a-zA-Z0-9_-]+" ; then
        assignee=$(echo "$commit_msg" | sed -n 's/.*@\\([a-zA-Z0-9_-]*\\).*/\\1/p')
    fi
    
    # Create card via CLI
    if command -v kb >/dev/null 2>&1; then
        column="todo"
        case "$type" in
            "fix") column="in-progress" ;;
            "feat") column="todo" ;;
            "docs"|"style") column="backlog" ;;
        esac
        
        kb add "$description" --priority "$priority" --column "$column" \${assignee:+--assignee "$assignee"} >/dev/null 2>&1 || true
    fi
fi
`;

    await fs.writeFile(hookPath, hookContent, { mode: 0o755 });
  }

  private async installPostCommitHook(): Promise<void> {
    const hookPath = path.join(this.hooksDir, 'post-commit');
    const hookContent = `#!/bin/sh
# KanbanLight Git Integration - Post Commit Hook

commit_hash=$(git rev-parse HEAD)
commit_msg=$(git log -1 --pretty=%B)

# Log commit to KanbanLight events
if command -v kb >/dev/null 2>&1; then
    # This would integrate with the board service to log git commits
    echo "Git commit $commit_hash logged to KanbanLight" >/dev/null 2>&1 || true
fi
`;

    await fs.writeFile(hookPath, hookContent, { mode: 0o755 });
  }

  async uninstallHooks(): Promise<void> {
    console.log(chalk.blue('🗑️  Removing KanbanLight Git hooks...'));

    const hooks = ['commit-msg', 'post-commit'];
    
    for (const hook of hooks) {
      const hookPath = path.join(this.hooksDir, hook);
      try {
        const content = await fs.readFile(hookPath, 'utf8');
        if (content.includes('KanbanLight Git Integration')) {
          await fs.unlink(hookPath);
          console.log(chalk.gray(`Removed ${hook} hook`));
        }
      } catch {
        // Hook doesn't exist or not readable
      }
    }

    console.log(chalk.green('✅ Git hooks removed successfully!'));
  }

  async showHooksStatus(): Promise<void> {
    console.log(chalk.blue('📋 KanbanLight Git Hooks Status:'));

    const hooks = ['commit-msg', 'post-commit'];
    
    for (const hook of hooks) {
      const hookPath = path.join(this.hooksDir, hook);
      try {
        const content = await fs.readFile(hookPath, 'utf8');
        if (content.includes('KanbanLight Git Integration')) {
          console.log(chalk.green(`✅ ${hook}: Installed`));
        } else {
          console.log(chalk.yellow(`⚠️  ${hook}: Exists but not KanbanLight hook`));
        }
      } catch {
        console.log(chalk.red(`❌ ${hook}: Not installed`));
      }
    }

    console.log(chalk.gray('\nTo install hooks: kb hooks --install'));
    console.log(chalk.gray('To remove hooks: kb hooks --uninstall'));
  }

  async getCurrentCommit(): Promise<string> {
    try {
      return execSync('git rev-parse HEAD', { 
        cwd: this.projectRoot, 
        encoding: 'utf8' 
      }).trim();
    } catch {
      return '';
    }
  }

  async getCommitMessage(hash: string): Promise<string> {
    try {
      return execSync(`git log -1 --pretty=%B ${hash}`, { 
        cwd: this.projectRoot, 
        encoding: 'utf8' 
      }).trim();
    } catch {
      return '';
    }
  }

  async isGitRepository(): Promise<boolean> {
    try {
      execSync('git rev-parse --git-dir', { cwd: this.projectRoot, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}