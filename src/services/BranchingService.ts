interface BoardBranch {
  id: string;
  name: string;
  parentId: string | null;
  boardSnapshot: any;
  createdAt: number;
  lastCommit: string;
  author: string;
  description?: string;
}

interface MergeConflict {
  id: string;
  type: 'card_conflict' | 'column_conflict' | 'metadata_conflict';
  path: string;
  localValue: any;
  remoteValue: any;
  baseValue: any;
}

interface MergeResult {
  success: boolean;
  conflicts: MergeConflict[];
  mergedBoard?: any;
  commitId?: string;
}

class BranchingService {
  private branches: Map<string, BoardBranch> = new Map();
  private currentBranch: string = 'main';
  private commits: Map<string, any> = new Map();

  constructor() {
    this.loadBranches();
  }

  private loadBranches(): void {
    const saved = localStorage.getItem('kanban-branches');
    if (saved) {
      const data = JSON.parse(saved);
      this.branches = new Map(data.branches);
      this.currentBranch = data.currentBranch || 'main';
    } else {
      // Create main branch
      this.createBranch('main', null, 'Initial branch');
    }
  }

  private saveBranches(): void {
    localStorage.setItem('kanban-branches', JSON.stringify({
      branches: Array.from(this.branches.entries()),
      currentBranch: this.currentBranch
    }));
  }

  createBranch(name: string, parentId: string | null, description?: string): BoardBranch {
    const branch: BoardBranch = {
      id: `branch-${Date.now()}`,
      name,
      parentId,
      boardSnapshot: this.getCurrentBoardSnapshot(),
      createdAt: Date.now(),
      lastCommit: this.generateCommitId(),
      author: 'current-user',
      description
    };

    this.branches.set(branch.id, branch);
    this.saveBranches();
    return branch;
  }

  switchBranch(branchId: string): boolean {
    const branch = this.branches.get(branchId);
    if (!branch) return false;

    this.currentBranch = branchId;
    this.saveBranches();
    
    // Apply branch snapshot to current board
    this.applyBoardSnapshot(branch.boardSnapshot);
    return true;
  }

  mergeBranch(sourceBranchId: string, targetBranchId: string): MergeResult {
    const sourceBranch = this.branches.get(sourceBranchId);
    const targetBranch = this.branches.get(targetBranchId);

    if (!sourceBranch || !targetBranch) {
      return { success: false, conflicts: [] };
    }

    // Perform three-way merge
    const conflicts = this.detectMergeConflicts(
      sourceBranch.boardSnapshot,
      targetBranch.boardSnapshot,
      this.getCommonAncestor(sourceBranchId, targetBranchId)
    );

    if (conflicts.length === 0) {
      // Fast-forward merge
      const mergedBoard = this.performAutoMerge(
        sourceBranch.boardSnapshot,
        targetBranch.boardSnapshot
      );

      const commitId = this.createMergeCommit(sourceBranchId, targetBranchId);
      
      return {
        success: true,
        conflicts: [],
        mergedBoard,
        commitId
      };
    }

    return {
      success: false,
      conflicts,
      mergedBoard: undefined
    };
  }

  private detectMergeConflicts(source: any, target: any, base: any): MergeConflict[] {
    const conflicts: MergeConflict[] = [];

    // Check for card conflicts
    const sourceCards = source.columns?.flatMap((col: any) => col.cards) || [];
    const targetCards = target.columns?.flatMap((col: any) => col.cards) || [];
    const baseCards = base?.columns?.flatMap((col: any) => col.cards) || [];

    for (const sourceCard of sourceCards) {
      const targetCard = targetCards.find((c: any) => c.id === sourceCard.id);
      const baseCard = baseCards.find((c: any) => c.id === sourceCard.id);

      if (targetCard && baseCard) {
        // Check if both branches modified the same card differently
        if (this.hasConflictingChanges(sourceCard, targetCard, baseCard)) {
          conflicts.push({
            id: `conflict-${sourceCard.id}`,
            type: 'card_conflict',
            path: `cards.${sourceCard.id}`,
            localValue: sourceCard,
            remoteValue: targetCard,
            baseValue: baseCard
          });
        }
      }
    }

    return conflicts;
  }

  private hasConflictingChanges(source: any, target: any, base: any): boolean {
    const sourceChanged = JSON.stringify(source) !== JSON.stringify(base);
    const targetChanged = JSON.stringify(target) !== JSON.stringify(base);
    const differentChanges = JSON.stringify(source) !== JSON.stringify(target);

    return sourceChanged && targetChanged && differentChanges;
  }

  private performAutoMerge(source: any, target: any): any {
    // Simple merge strategy - prefer source changes
    return {
      ...target,
      ...source,
      updatedAt: Date.now(),
      mergedAt: Date.now()
    };
  }

  private getCommonAncestor(branchId1: string, branchId2: string): any {
    // Simplified - in real implementation would traverse branch history
    return { columns: [] };
  }

  private getCurrentBoardSnapshot(): any {
    // Get current board state from collaboration service
    return {
      id: 'current-board',
      title: 'Current Board',
      columns: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  private applyBoardSnapshot(snapshot: any): void {
    // Apply snapshot to current board state
    console.log('Applying board snapshot:', snapshot);
  }

  private generateCommitId(): string {
    return Math.random().toString(36).substr(2, 8);
  }

  private createMergeCommit(sourceBranchId: string, targetBranchId: string): string {
    const commitId = this.generateCommitId();
    const commit = {
      id: commitId,
      type: 'merge',
      sourceBranch: sourceBranchId,
      targetBranch: targetBranchId,
      timestamp: Date.now(),
      author: 'current-user'
    };

    this.commits.set(commitId, commit);
    return commitId;
  }

  getBranches(): BoardBranch[] {
    return Array.from(this.branches.values());
  }

  getCurrentBranch(): BoardBranch | null {
    return this.branches.get(this.currentBranch) || null;
  }

  getBranchHistory(branchId: string): any[] {
    // Return commit history for branch
    return Array.from(this.commits.values())
      .filter(commit => commit.branchId === branchId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  resolveMergeConflict(conflictId: string, resolution: any): void {
    // Apply conflict resolution
    console.log(`Resolving conflict ${conflictId}:`, resolution);
  }
}

export const branchingService = new BranchingService();