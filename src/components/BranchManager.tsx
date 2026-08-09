import React, { useState, useEffect } from 'react';
import { GitBranch, GitMerge, Plus, Check, Clock, User, ArrowRight, Loader2, Eye } from 'lucide-react';
import { branchingService, BoardBranch } from '../services/BranchingService';
import { useKanbanStore } from '../store/useKanbanStore';
import { Tooltip } from './Tooltip';

export const BranchManager: React.FC = () => {
  const [branches, setBranches] = useState<BoardBranch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<BoardBranch | null>(null);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchDescription, setNewBranchDescription] = useState('');
  const [selectedMergeBranch, setSelectedMergeBranch] = useState<string>('');
  const [isSwitching, setIsSwitching] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const activeBranchId = useKanbanStore((state) => state.activeBranchId);
  const startBranchDiff = useKanbanStore((state) => state.startBranchDiff);
  const setShowBranchManager = useKanbanStore((state) => state.setShowBranchManager);

  useEffect(() => {
    loadBranches();
  }, [activeBranchId]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadBranches = () => {
    setBranches(branchingService.getBranches());
    setCurrentBranch(branchingService.getCurrentBranch());
  };

  const handleCreateBranch = async () => {
    if (!newBranchName.trim() || isSwitching) return;

    setIsSwitching(true);
    const parentId = currentBranch?.id || 'main';
    const branchName = newBranchName.trim();

    try {
      await branchingService.createBranch(branchName, parentId, newBranchDescription);
      setNewBranchName('');
      setNewBranchDescription('');
      setIsCreatingBranch(false);
      loadBranches();
      showToast(`Branch "${branchName}" created & active!`, 'success');
    } catch (error) {
      console.error('Error creating branch:', error);
      showToast('Failed to create branch.', 'error');
    } finally {
      setIsSwitching(false);
    }
  };

  const handleSwitchBranch = async (branchId: string) => {
    if (isSwitching) return;

    const targetBranch = branches.find((b) => b.id === branchId);
    setIsSwitching(true);

    try {
      const success = await branchingService.switchBranch(branchId);
      if (success) {
        loadBranches();
        showToast(`Switched to branch "${targetBranch?.name || branchId}"`, 'success');
      } else {
        showToast('Failed to switch branch.', 'error');
      }
    } catch (error) {
      console.error('Error switching branch:', error);
      showToast('Failed to switch branch.', 'error');
    } finally {
      setIsSwitching(false);
    }
  };

  const handleCompareBranch = async (branchId: string) => {
    if (isSwitching) return;
    setIsSwitching(true);
    try {
      const success = await startBranchDiff(branchId);
      if (success) {
        setShowBranchManager(false);
      } else {
        showToast('Failed to compare branch.', 'error');
      }
    } catch (error) {
      console.error('Error comparing branch:', error);
      showToast('Failed to compare branch.', 'error');
    } finally {
      setIsSwitching(false);
    }
  };

  const handleMergeBranch = () => {
    if (!selectedMergeBranch || !currentBranch) return;

    const result = branchingService.mergeBranch(selectedMergeBranch, currentBranch.id);
    
    if (result.success) {
      showToast('Merge successful!', 'success');
      loadBranches();
    } else {
      showToast('Merge conflicts detected', 'error');
    }
    
    setSelectedMergeBranch('');
  };

  const getBranchIcon = (branch: BoardBranch) => {
    if (branch.id === currentBranch?.id) {
      return <Check className="w-4 h-4 text-green-500" />;
    }
    return <GitBranch className="w-4 h-4 text-slate-400 dark:text-zinc-500" />;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg shadow-sm transition-colors duration-200">
      {/* Toast Banner */}
      {toast && (
        <div className={`p-3 text-sm font-medium border-b flex items-center justify-between transition-all ${
          toast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900' : 'bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 border-red-200 dark:border-red-900'
        }`}>
          <div className="flex items-center space-x-2">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{toast.message}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-xs text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200">
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-center space-x-3">
          <GitBranch className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h3 className="font-medium text-slate-800 dark:text-zinc-100">Branch Manager</h3>
          {isSwitching && (
            <span className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Working...</span>
            </span>
          )}
        </div>
        <button
          onClick={() => setIsCreatingBranch(true)}
          disabled={isSwitching}
          className="flex items-center space-x-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Branch</span>
        </button>
      </div>

      {/* Current Branch */}
      {currentBranch && (
        <div className="p-4 bg-green-50 dark:bg-emerald-950/30 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center space-x-3">
            <Check className="w-5 h-5 text-green-600 dark:text-emerald-400" />
            <div>
              <h4 className="font-medium text-green-800 dark:text-emerald-300">{currentBranch.name}</h4>
              <p className="text-sm text-green-600 dark:text-emerald-400/80">Current active branch</p>
            </div>
          </div>
        </div>
      )}

      {/* Branch List */}
      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800/60">
        {branches.map((branch) => (
          <div
            key={branch.id}
            className={`flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors ${
              branch.id === currentBranch?.id ? 'bg-green-50/50 dark:bg-emerald-950/20' : ''
            }`}
          >
            <div className="flex items-center space-x-3 flex-1">
              {getBranchIcon(branch)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-medium text-slate-800 dark:text-zinc-100 truncate">
                    {branch.name}
                  </h4>
                  {branch.parentId && (
                    <span className="text-xs bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 px-2 py-0.5 rounded border border-slate-200/50 dark:border-zinc-700/50">
                      from {branches.find(b => b.id === branch.parentId)?.name || 'unknown'}
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-4 mt-1">
                  <div className="flex items-center space-x-1 text-xs text-slate-500 dark:text-zinc-400">
                    <User className="w-3 h-3" />
                    <span>{branch.author}</span>
                  </div>
                  <div className="flex items-center space-x-1 text-xs text-slate-500 dark:text-zinc-400">
                    <Clock className="w-3 h-3" />
                    <span>{formatDate(branch.createdAt)}</span>
                  </div>
                </div>
                {branch.description && (
                  <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1 truncate">
                    {branch.description}
                  </p>
                )}
              </div>
            </div>

            {branch.id !== currentBranch?.id && (
              <div className="flex items-center space-x-2">
                {/* Compare Button with Rich Hover Tooltip */}
                <Tooltip content="Visually diff this branch against your current state." position="top">
                  <button
                    data-tour="branch-compare-btn"
                    onClick={() => handleCompareBranch(branch.id)}
                    disabled={isSwitching}
                    className="flex items-center space-x-1 px-2.5 py-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 border border-indigo-200 dark:border-indigo-900 rounded hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-50 transition-colors"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Compare</span>
                  </button>
                </Tooltip>

                <button
                  onClick={() => handleSwitchBranch(branch.id)}
                  disabled={isSwitching}
                  className="flex items-center space-x-1 px-2.5 py-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 border border-blue-200 dark:border-blue-900 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-50 transition-colors"
                >
                  {isSwitching && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>Switch</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Merge Section */}
      <div className="p-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60">
        <div className="flex items-center space-x-3">
          <GitMerge className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <select
            value={selectedMergeBranch}
            onChange={(e) => setSelectedMergeBranch(e.target.value)}
            className="flex-1 px-2 py-1 text-sm border border-slate-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100"
          >
            <option value="">Select branch to merge...</option>
            {branches
              .filter(b => b.id !== currentBranch?.id)
              .map(branch => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
          </select>
          <button
            onClick={handleMergeBranch}
            disabled={!selectedMergeBranch}
            className="px-3 py-1 text-sm bg-purple-500 hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Merge
          </button>
        </div>
      </div>

      {/* Create Branch Modal */}
      {isCreatingBranch && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-zinc-800">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-zinc-100">Create New Branch</h3>
              <button
                onClick={() => setIsCreatingBranch(false)}
                className="p-1 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded"
              >
                ×
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                  Branch Name *
                </label>
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="feature/new-dashboard"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                  Description
                </label>
                <textarea
                  value={newBranchDescription}
                  onChange={(e) => setNewBranchDescription(e.target.value)}
                  placeholder="Describe what this branch is for..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {currentBranch && (
                <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/50 dark:border-zinc-700/50 p-3 rounded-lg">
                  <ArrowRight className="w-4 h-4 text-blue-500" />
                  <span>Branching from: <strong>{currentBranch.name}</strong></span>
                </div>
              )}
            </div>
            
            <div className="flex justify-end space-x-3 p-4 border-t border-slate-200 dark:border-zinc-800">
              <button
                onClick={() => setIsCreatingBranch(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-zinc-300 hover:text-slate-800 dark:hover:text-zinc-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim()}
                className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create Branch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};