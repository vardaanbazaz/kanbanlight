import React, { useEffect } from 'react';
import { GitBranch, Users, Zap, Terminal, Wifi, WifiOff, Database, Package } from 'lucide-react';
import { Column } from './Column';
import { CollaborativeCursor } from './CollaborativeCursor';
import { ConflictResolutionModal } from './ConflictResolutionModal';
import { AIInsightsPanel } from './AIInsightsPanel';
import { SmartCardCreator } from './SmartCardCreator';
import { PluginManager } from './PluginManager';
import { BranchManager } from './BranchManager';
import { useKanbanStore } from '../store/useKanbanStore';

export const KanbanBoard: React.FC = () => {
  const {
    columns,
    events,
    users,
    conflicts,
    connectionStatus,
    insights,
    isAIProcessing,
    activeBranchId,
    isDiffModeActive,
    diffTargetBranchId,
    branchDiff,
    isCliConnected,
    showPluginManager,
    showBranchManager,
    showSmartCardCreator,
    initializeStore,
    resolveConflict,
    exitDiffMode,
    setCommandPaletteOpen,
    setShowPluginManager,
    setShowBranchManager,
    setShowSmartCardCreator,
    createCard,
  } = useKanbanStore();

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  const handleCreateSmartCard = async (cardData: any) => {
    await createCard(cardData.title, cardData.columnId || 'backlog', cardData);
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <GitBranch className="w-6 h-6 text-slate-700" />
              <h1 className="text-xl font-semibold text-slate-900">KanbanLight</h1>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-mono">
                {activeBranchId}@{events.length}
              </span>
            </div>

            {isCliConnected && (
              <div className="flex items-center space-x-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-mono font-medium" title="CLI Bridge Active (ws://localhost:8080)">
                <Terminal className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                <span>CLI Connected</span>
              </div>
            )}
            
            {insights && (
              <div className="flex items-center space-x-2 text-sm text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
                <Zap className="w-4 h-4" />
                <span>{insights}</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {/* Collaboration Status */}
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-slate-500" />
              <span className="text-sm text-slate-600">{users.length} online</span>
              
              {/* Connection Status */}
              <div className="flex items-center space-x-1">
                {connectionStatus === 'connected' ? (
                  <span title="Connected"><Wifi className="w-4 h-4 text-green-500" /></span>
                ) : (
                  <span title="Offline"><WifiOff className="w-4 h-4 text-amber-500" /></span>
                )}
                <span className="text-xs text-slate-500 capitalize">{connectionStatus}</span>
              </div>
              
              <div className="flex -space-x-1">
                {users.slice(0, 3).map((user) => (
                  <div
                    key={user.id}
                    className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-400 to-purple-500 border-2 border-white flex items-center justify-center text-xs text-white font-medium"
                    title={user.name}
                  >
                    {user.name[0]}
                  </div>
                ))}
              </div>
            </div>

            {/* Command Palette Trigger */}
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="flex items-center space-x-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-600 transition-colors"
            >
              <Terminal className="w-4 h-4" />
              <span>⌘K</span>
            </button>

            {/* AI Processing Indicator */}
            {isAIProcessing && (
              <div className="flex items-center space-x-2 text-sm text-blue-600">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <span>AI analyzing...</span>
              </div>
            )}

            {/* Data Export/Import */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowPluginManager(true)}
                className="p-2 hover:bg-slate-100 rounded-lg"
                title="Plugin Manager"
              >
                <Package className="w-4 h-4 text-slate-500" />
              </button>
              
              <button
                onClick={() => setShowBranchManager(true)}
                className="p-2 hover:bg-slate-100 rounded-lg"
                title="Branch Manager"
              >
                <GitBranch className="w-4 h-4 text-slate-500" />
              </button>
              
              <button
                onClick={async () => {
                  const dataStr = JSON.stringify(events, null, 2);
                  const dataBlob = new Blob([dataStr], { type: 'application/json' });
                  const url = URL.createObjectURL(dataBlob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `kanban-export-${Date.now()}.json`;
                  link.click();
                }}
                className="p-2 hover:bg-slate-100 rounded-lg"
                title="Export Data"
              >
                <Database className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Visual Diff Floating Mode Banner */}
      {isDiffModeActive && (
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white px-6 py-3 shadow-md flex items-center justify-between z-40 border-b border-indigo-700 animate-fadeIn">
          <div className="flex items-center space-x-3 text-sm">
            <div className="flex items-center space-x-2 bg-indigo-800/80 px-3 py-1 rounded-md border border-indigo-600 font-mono text-xs">
              <GitBranch className="w-3.5 h-3.5 text-blue-300" />
              <span className="font-semibold text-blue-200">{activeBranchId}</span>
              <span className="text-slate-400">vs</span>
              <span className="font-semibold text-purple-200">{diffTargetBranchId}</span>
            </div>
            <span className="text-slate-300 font-medium">Visual Diff Active:</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              +{branchDiff?.addedCards.length || 0} Added
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              ~{branchDiff?.modifiedCards.length || 0} Modified
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/40">
              -{branchDiff?.deletedCards.length || 0} Deleted
            </span>
          </div>
          <button
            onClick={exitDiffMode}
            className="flex items-center space-x-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-md shadow transition-colors"
          >
            <span>Exit Diff Mode</span>
          </button>
        </div>
      )}

      {/* Board */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Board Area */}
        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex space-x-6 h-full min-w-max">
            {columns.map((column: { id: string; title: string; color: string }) => (
              <Column
                key={column.id}
                id={column.id}
                title={column.title}
                color={column.color}
              />
            ))}
          </div>
        </div>

        {/* AI Insights Sidebar (Cleaned up duplicate BranchManager) */}
        <div className="w-80 border-l border-slate-200 bg-white p-4 overflow-y-auto">
          <div className="space-y-4">
            <AIInsightsPanel />
            
            {/* Quick Actions */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-slate-800 mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setShowSmartCardCreator(true)}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors"
                >
                  <Zap className="w-4 h-4" />
                  <span>Create Smart Card</span>
                </button>
                <button
                  onClick={() => setShowBranchManager(true)}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <GitBranch className="w-4 h-4" />
                  <span>Manage Branches</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Collaborative Cursors */}
      {users.map((user) => (
        <CollaborativeCursor key={user.id} user={user} />
      ))}

      {/* Conflict Resolution */}
      {conflicts.length > 0 && (
        <ConflictResolutionModal
          conflicts={conflicts}
          onResolve={resolveConflict}
        />
      )}

      {/* Smart Card Creator */}
      {showSmartCardCreator && (
        <SmartCardCreator
          onCreateCard={handleCreateSmartCard}
          onClose={() => setShowSmartCardCreator(false)}
        />
      )}

      {/* Plugin Manager Modal */}
      {showPluginManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Plugin Manager</h2>
              <button
                onClick={() => setShowPluginManager(false)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <PluginManager />
            </div>
          </div>
        </div>
      )}

      {/* Branch Manager Modal */}
      {showBranchManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Branch Manager</h2>
              <button
                onClick={() => setShowBranchManager(false)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <BranchManager />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};