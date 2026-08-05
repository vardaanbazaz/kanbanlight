import React, { useState, useEffect } from 'react';
import { GitBranch, GitMerge, Plus, Check, Clock, User, ArrowRight } from 'lucide-react';
import { branchingService } from '../services/BranchingService';

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

export const BranchManager: React.FC = () => {
  const [branches, setBranches] = useState<BoardBranch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<BoardBranch | null>(null);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchDescription, setNewBranchDescription] = useState('');
  const [selectedMergeBranch, setSelectedMergeBranch] = useState<string>('');

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = () => {
    setBranches(branchingService.getBranches());
    setCurrentBranch(branchingService.getCurrentBranch());
  };

  const handleCreateBranch = () => {
    if (!newBranchName.trim()) return;

    const parentId = currentBranch?.id || null;
    branchingService.createBranch(newBranchName, parentId, newBranchDescription);
    
    setNewBranchName('');
    setNewBranchDescription('');
    setIsCreatingBranch(false);
    loadBranches();
  };

  const handleSwitchBranch = (branchId: string) => {
    if (branchingService.switchBranch(branchId)) {
      loadBranches();
    }
  };

  const handleMergeBranch = () => {
    if (!selectedMergeBranch || !currentBranch) return;

    const result = branchingService.mergeBranch(selectedMergeBranch, currentBranch.id);
    
    if (result.success) {
      console.log('Merge successful!');
      loadBranches();
    } else {
      console.log('Merge conflicts detected:', result.conflicts);
      // Handle conflicts in UI
    }
    
    setSelectedMergeBranch('');
  };

  const getBranchIcon = (branch: BoardBranch) => {
    if (branch.id === currentBranch?.id) {
      return <Check className="w-4 h-4 text-green-500" />;
    }
    return <GitBranch className="w-4 h-4 text-slate-400" />;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <GitBranch className="w-5 h-5 text-blue-600" />
          <h3 className="font-medium text-slate-800">Branch Manager</h3>
        </div>
        <button
          onClick={() => setIsCreatingBranch(true)}
          className="flex items-center space-x-2 px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Branch</span>
        </button>
      </div>

      {/* Current Branch */}
      {currentBranch && (
        <div className="p-4 bg-green-50 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <Check className="w-5 h-5 text-green-600" />
            <div>
              <h4 className="font-medium text-green-800">{currentBranch.name}</h4>
              <p className="text-sm text-green-600">Current branch</p>
            </div>
          </div>
        </div>
      )}

      {/* Branch List */}
      <div className="max-h-64 overflow-y-auto">
        {branches.map((branch) => (
          <div
            key={branch.id}
            className={`flex items-center justify-between p-3 hover:bg-slate-50 transition-colors ${
              branch.id === currentBranch?.id ? 'bg-green-50' : ''
            }`}
          >
            <div className="flex items-center space-x-3 flex-1">
              {getBranchIcon(branch)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-medium text-slate-800 truncate">
                    {branch.name}
                  </h4>
                  {branch.parentId && (
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      from {branches.find(b => b.id === branch.parentId)?.name || 'unknown'}
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-4 mt-1">
                  <div className="flex items-center space-x-1 text-xs text-slate-500">
                    <User className="w-3 h-3" />
                    <span>{branch.author}</span>
                  </div>
                  <div className="flex items-center space-x-1 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span>{formatDate(branch.createdAt)}</span>
                  </div>
                </div>
                {branch.description && (
                  <p className="text-xs text-slate-600 mt-1 truncate">
                    {branch.description}
                  </p>
                )}
              </div>
            </div>

            {branch.id !== currentBranch?.id && (
              <button
                onClick={() => handleSwitchBranch(branch.id)}
                className="px-2 py-1 text-xs text-blue-600 hover:text-blue-700 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
              >
                Switch
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Merge Section */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <div className="flex items-center space-x-3">
          <GitMerge className="w-4 h-4 text-purple-600" />
          <select
            value={selectedMergeBranch}
            onChange={(e) => setSelectedMergeBranch(e.target.value)}
            className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded"
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
            className="px-3 py-1 text-sm bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Merge
          </button>
        </div>
      </div>

      {/* Create Branch Modal */}
      {isCreatingBranch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">Create New Branch</h3>
              <button
                onClick={() => setIsCreatingBranch(false)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                ×
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Branch Name *
                </label>
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="feature/new-dashboard"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newBranchDescription}
                  onChange={(e) => setNewBranchDescription(e.target.value)}
                  placeholder="Describe what this branch is for..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {currentBranch && (
                <div className="flex items-center space-x-2 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                  <ArrowRight className="w-4 h-4" />
                  <span>Branching from: <strong>{currentBranch.name}</strong></span>
                </div>
              )}
            </div>
            
            <div className="flex justify-end space-x-3 p-4 border-t border-slate-200">
              <button
                onClick={() => setIsCreatingBranch(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim()}
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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