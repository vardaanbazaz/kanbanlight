# KanbanLight CLI

Command-line interface for KanbanLight - Git-paradigm project management.

## Installation

```bash
# Install globally
npm install -g kanban-cli

# Or run locally
npm install
npm run build
npm link
```

## Quick Start

```bash
# Initialize a new board
kb init --name "Sprint Planning"

# Add some cards
kb add "Implement user authentication" --priority high --assignee alice
kb add "Write API documentation" --priority medium --column todo
kb add "Fix login bug" --priority high --column in-progress

# View board status
kb status

# List all cards
kb list

# Move a card
kb move <card-id> done

# View history
kb log --oneline
```

## Git Integration

KanbanLight CLI integrates seamlessly with Git workflows:

```bash
# Install Git hooks
kb hooks --install

# Now your commits automatically create cards:
git commit -m "feat: add user dashboard [high] @alice"
# → Creates high-priority card assigned to Alice

git commit -m "fix: resolve login timeout bug [urgent]"
# → Creates high-priority card in in-progress column
```

## Commands

### Board Management
- `kb init [--name <name>]` - Initialize new board
- `kb boards` - List all boards  
- `kb checkout <board>` - Switch to different board

### Card Management
- `kb add <title>` - Create new card
- `kb list [--column <col>] [--assignee <user>]` - List cards
- `kb move <id> <column>` - Move card between columns

### Git-like Workflow
- `kb status` - Show board status and recent changes
- `kb log [--oneline] [-n <count>]` - Show change history
- `kb branch <name> [-b]` - Create board branch
- `kb merge <branch>` - Merge branch into current board

### Collaboration
- `kb sync [--force]` - Sync with remote collaborators
- `kb remote --add <url>` - Add remote board connection

### Git Integration
- `kb hooks --install` - Install Git hooks for auto-card creation
- `kb hooks --uninstall` - Remove Git hooks
- `kb hooks` - Show hooks status

## Configuration

KanbanLight CLI stores data in `.kanban/` directory:
- `boards.db` - SQLite database with boards and cards
- `config.json` - CLI configuration
- `remotes.json` - Remote board connections

## Git Hook Patterns

The CLI automatically creates cards from commit messages matching these patterns:

```bash
# Basic pattern: type: description
git commit -m "feat: add user authentication"
# → Creates medium-priority card in 'todo' column

# With priority: [high|medium|low|urgent]
git commit -m "fix: critical security bug [urgent]"
# → Creates high-priority card in 'in-progress' column

# With assignee: @username
git commit -m "docs: update API documentation @alice"
# → Creates card assigned to 'alice'

# Combined
git commit -m "feat: implement dashboard [high] @bob"
# → High-priority card assigned to 'bob' in 'todo' column
```

## Examples

### Daily Workflow
```bash
# Start your day
kb status

# Add tasks from standup
kb add "Review PR #123" --assignee alice --priority high
kb add "Update deployment docs" --column backlog

# Work on tasks
kb move card-abc123 in-progress
kb move card-def456 done

# Check what's changed
kb log -n 5

# Sync with team
kb sync
```

### Sprint Planning
```bash
# Create sprint branch
kb branch "sprint-24" --checkout

# Import tasks from Git commits
kb hooks --install
# Now commits automatically create cards

# Review sprint progress
kb list --column in-progress
kb status
```

### Team Collaboration
```bash
# Add remote team board
kb remote --add https://kanban.company.com/boards/team-alpha

# Sync changes
kb sync

# Create feature branch
kb branch "feature-auth" --checkout

# Work and merge back
kb add "Implement OAuth flow" --priority high
kb checkout main
kb merge "feature-auth"
```

## Architecture

The CLI demonstrates several advanced patterns:

- **Local-first data** with SQLite storage
- **Event sourcing** for complete audit trails  
- **Git integration** via hooks and commit parsing
- **Real-time sync** with WebSocket-based remotes
- **Branching/merging** workflows like Git
- **Plugin architecture** for extensibility

This showcases enterprise-level CLI design with sophisticated data modeling, real-time collaboration, and developer-friendly workflows.