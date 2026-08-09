import { useKanbanStore } from '../store/useKanbanStore';

export interface BoardBranch {
  id: string;
  name: string;
  parentId: string | null;
  boardSnapshot: any;
  createdAt: number;
  lastCommit: string;
  author: string;
  description?: string;
}

export interface MergeConflict {
  id: string;
  type: 'card_conflict' | 'column_conflict' | 'metadata_conflict';
  path: string;
  localValue: any;
  remoteValue: any;
  baseValue: any;
}

export interface MergeResult {
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
      // Create default main branch
      const mainBranch: BoardBranch = {
        id: 'main',
        name: 'main',
        parentId: null,
        boardSnapshot: null,
        createdAt: Date.now(),
        lastCommit: 'init',
        author: 'system',
        description: 'Main production branch'
      };
      this.branches.set('main', mainBranch);
      this.saveBranches();
    }
  }

  private saveBranches(): void {
    localStorage.setItem('kanban-branches', JSON.stringify({
      branches: Array.from(this.branches.entries()),
      currentBranch: this.currentBranch
    }));
  }

  setActiveBranchId(branchId: string): void {
    this.currentBranch = branchId;
    this.saveBranches();
  }

  async createBranch(name: string, parentId: string | null, description?: string): Promise<BoardBranch> {
    const branchId = `branch-${Date.now()}`;
    const branch: BoardBranch = {
      id: branchId,
      name,
      parentId: parentId || 'main',
      boardSnapshot: this.getCurrentBoardSnapshot(),
      createdAt: Date.now(),
      lastCommit: this.generateCommitId(),
      author: 'current-user',
      description
    };

    this.branches.set(branch.id, branch);
    this.saveBranches();

    // 1. Create a snapshot for the new branch using current state
    await useKanbanStore.getState().createSnapshot(branchId);

    // 2. Switch active branch in store
    await useKanbanStore.getState().switchBranch(branchId);

    return branch;
  }

  async switchBranch(branchId: string): Promise<boolean> {
    const branch = this.branches.get(branchId);
    if (!branch) return false;

    this.currentBranch = branchId;
    this.saveBranches();

    const success = await useKanbanStore.getState().switchBranch(branchId);
    return success;
  }

  async compareBranch(targetBranchId: string): Promise<boolean> {
    return await useKanbanStore.getState().startBranchDiff(targetBranchId);
  }

  mergeBranch(sourceBranchId: string, targetBranchId: string): MergeResult {
    const sourceBranch = this.branches.get(sourceBranchId);
    const targetBranch = this.branches.get(targetBranchId);

    if (!sourceBranch || !targetBranch) {
      return { success: false, conflicts: [] };
    }

    const conflicts = this.detectMergeConflicts(
      sourceBranch.boardSnapshot,
      targetBranch.boardSnapshot,
      this.getCommonAncestor(sourceBranchId, targetBranchId)
    );

    if (conflicts.length === 0) {
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

    const sourceCards = source.columns?.flatMap((col: any) => col.cards) || [];
    const targetCards = target.columns?.flatMap((col: any) => col.cards) || [];
    const baseCards = base?.columns?.flatMap((col: any) => col.cards) || [];

    for (const sourceCard of sourceCards) {
      const targetCard = targetCards.find((c: any) => c.id === sourceCard.id);
      const baseCard = baseCards.find((c: any) => c.id === sourceCard.id);

      if (targetCard && baseCard) {
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
    return {
      ...target,
      ...source,
      updatedAt: Date.now(),
      mergedAt: Date.now()
    };
  }

  private getCommonAncestor(_branchId1: string, _branchId2: string): any {
    return { columns: [] };
  }

  getCurrentBoardSnapshot(): any {
    const state = useKanbanStore.getState();
    return {
      id: state.board?.id || 'default-board',
      title: state.board?.title || 'Current Board',
      columns: state.columns,
      cards: state.cards,
      events: state.events,
      createdAt: state.board?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
  }

  applyBoardSnapshot(snapshot: any): void {
    if (!snapshot) return;
    useKanbanStore.setState({
      cards: snapshot.cards || [],
      columns: snapshot.columns || [],
      events: snapshot.events || [],
      board: snapshot.board || useKanbanStore.getState().board,
    });
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
    return Array.from(this.commits.values())
      .filter(commit => commit.branchId === branchId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  resolveMergeConflict(conflictId: string, resolution: any): void {
    console.log(`Resolving conflict ${conflictId}:`, resolution);
  }
}

export const branchingService = new BranchingService();