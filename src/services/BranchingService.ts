import { useKanbanStore } from '../store/useKanbanStore';

export interface BoardBranch {
  id: string;
  name: string;
  parentId: string | null;
  // Fork-point state, unread while merge is parked; reserved as the merge base for the rebuild
  boardSnapshot: any;
  createdAt: number;
  lastCommit: string;
  author: string;
  description?: string;
}

class BranchingService {
  private branches: Map<string, BoardBranch> = new Map();
  private currentBranch: string = 'main';

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

  private generateCommitId(): string {
    return Math.random().toString(36).substr(2, 8);
  }

  getBranches(): BoardBranch[] {
    return Array.from(this.branches.values());
  }

  getCurrentBranch(): BoardBranch | null {
    return this.branches.get(this.currentBranch) || null;
  }
}

export const branchingService = new BranchingService();