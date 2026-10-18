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

type SavedBranches = { branches: [string, BoardBranch][]; currentBranch: string };

// The stored list must be [id, { id, name }] pairs with text ids and names, and a text pointer.
function readSavedBranches(saved: string): SavedBranches | null {
  try {
    const data = JSON.parse(saved);
    const isEntry = (entry: unknown) =>
      Array.isArray(entry) &&
      typeof entry[0] === 'string' &&
      typeof entry[1]?.id === 'string' &&
      typeof entry[1]?.name === 'string';
    if (!Array.isArray(data?.branches) || !data.branches.every(isEntry) || typeof data.currentBranch !== 'string') {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

class BranchingService {
  private branches: Map<string, BoardBranch> = new Map();
  private currentBranch: string = 'main';
  // Set when the stored list cannot be read. Nothing is saved while it is set, so the stored value is kept.
  loadError = false;

  constructor() {
    this.loadBranches();
  }

  private loadBranches(): void {
    const saved = localStorage.getItem('kanban-branches');
    if (saved) {
      const data = readSavedBranches(saved);
      if (!data) {
        this.loadError = true;
        return;
      }
      this.branches = new Map(data.branches);
      this.currentBranch = data.currentBranch || 'main';
      if (!this.branches.has(this.currentBranch)) this.keepUnknownPointer();
    } else {
      this.branches.set('main', this.createMainBranch());
      this.saveBranches();
    }
  }

  private createMainBranch(): BoardBranch {
    return {
      id: 'main',
      name: 'main',
      parentId: null,
      boardSnapshot: null,
      createdAt: Date.now(),
      lastCommit: 'init',
      author: 'system',
      description: 'Default branch'
    };
  }

  // An earlier version could point at a branch that is not listed. List it, so its working copy
  // belongs to a visible branch and switching to main loads main's own snapshot. A missing main is recreated as main.
  private keepUnknownPointer(): void {
    if (this.currentBranch === 'main') {
      this.branches.set('main', this.createMainBranch());
      this.saveBranches();
      return;
    }
    const names = new Set(this.getBranches().map((branch) => branch.name));
    let name = 'recovered';
    for (let n = 2; names.has(name); n++) name = `recovered-${n}`;
    this.branches.set(this.currentBranch, {
      id: this.currentBranch,
      name,
      parentId: 'main',
      boardSnapshot: null,
      createdAt: Date.now(),
      lastCommit: this.generateCommitId(),
      author: 'system',
    });
    this.saveBranches();
  }

  private saveBranches(): void {
    if (this.loadError) return;
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