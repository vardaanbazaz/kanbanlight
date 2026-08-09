import React, { useEffect, useState } from 'react';
import { GitBranch, Users, Zap, Terminal, Wifi, WifiOff, Database, Package, Sun, Moon, HelpCircle } from 'lucide-react';
import { Column } from './Column';
import { CollaborativeCursor } from './CollaborativeCursor';
import { ConflictResolutionModal } from './ConflictResolutionModal';
import { AIInsightsPanel } from './AIInsightsPanel';
import { SmartCardCreator } from './SmartCardCreator';
import { PluginManager } from './PluginManager';
import { BranchManager } from './BranchManager';
import { Tooltip } from './Tooltip';
import { GuidedTour } from './GuidedTour';
import { useKanbanStore } from '../store/useKanbanStore';
import { useTheme } from '../providers/ThemeProvider';

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

  const { resolvedTheme, toggleTheme } = useTheme();

  const [isTourOpen, setIsTourOpen] = useState(() => {
    return localStorage.getItem('kanbanlight-tour-completed') !== 'true';
  });

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  const handleCreateSmartCard = async (cardData: any) => {
    await createCard(cardData.title, cardData.columnId || 'backlog', cardData);
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-950 dark:to-zinc-900 text-slate-900 dark:text-zinc-100 transition-colors duration-200">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 px-6 py-4 shadow-sm transition-colors duration-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <GitBranch className="w-6 h-6 text-slate-700 dark:text-zinc-300" />
              <h1 className="text-xl font-semibold text-slate-900 dark:text-zinc-100">KanbanLight</h1>
              
              {/* Branch Badge with Tooltip & Tour target */}
              <Tooltip content="Your current isolated workspace. Switch branches to time-travel." position="bottom">
                <span data-tour="branch-badge" className="text-xs bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 px-2.5 py-1 rounded-full font-mono cursor-help transition-colors">
                  {activeBranchId}@{events.length}
                </span>
              </Tooltip>
            </div>

            {/* CLI Connected Badge with Tooltip & Tour target */}
            {isCliConnected && (
              <Tooltip content="Live WebSocket bridge active. Open your terminal and type 'kb help'." position="bottom">
                <div data-tour="cli-badge" className="flex items-center space-x-1.5 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 px-2.5 py-1 rounded-full font-mono font-medium cursor-help transition-colors">
                  <Terminal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                  <span>CLI Connected</span>
                </div>
              </Tooltip>
            )}
            
            {insights && (
              <div className="flex items-center space-x-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 px-3 py-1 rounded-full">
                <Zap className="w-4 h-4" />
                <span>{insights}</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {/* Collaboration Status */}
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
              <span className="text-sm text-slate-600 dark:text-zinc-300">{users.length} online</span>
              
              {/* Connection Status */}
              <div className="flex items-center space-x-1">
                {connectionStatus === 'connected' ? (
                  <span title="Connected"><Wifi className="w-4 h-4 text-green-500" /></span>
                ) : (
                  <span title="Offline"><WifiOff className="w-4 h-4 text-amber-500" /></span>
                )}
                <span className="text-xs text-slate-500 dark:text-zinc-400 capitalize">{connectionStatus}</span>
              </div>
              
              <div className="flex -space-x-1">
                {users.slice(0, 3).map((user) => (
                  <div
                    key={user.id}
                    className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-400 to-purple-500 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-xs text-white font-medium shadow-sm"
                    title={user.name}
                  >
                    {user.name[0]}
                  </div>
                ))}
              </div>
            </div>

            {/* Help / Guided Tour Button */}
            <Tooltip content="Product Tour & Help" position="bottom">
              <button
                onClick={() => setIsTourOpen(true)}
                className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-purple-600 dark:text-purple-400 rounded-lg transition-colors"
                aria-label="Start Guided Product Tour"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </Tooltip>

            {/* Theme Toggle Button */}
            <Tooltip content={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`} position="bottom">
              <button
                onClick={toggleTheme}
                className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 rounded-lg transition-colors"
                aria-label="Toggle dark mode"
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-slate-600" />
                )}
              </button>
            </Tooltip>

            {/* Command Palette Trigger & Tour Target */}
            <Tooltip content="Quick command palette (⌘K)" position="bottom">
              <button
                data-tour="command-palette-btn"
                onClick={() => setCommandPaletteOpen(true)}
                className="flex items-center space-x-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg text-sm text-slate-600 dark:text-zinc-300 transition-colors border border-transparent dark:border-zinc-700/50"
              >
                <Terminal className="w-4 h-4" />
                <span className="font-mono text-xs">⌘K</span>
              </button>
            </Tooltip>

            {/* AI Processing Indicator */}
            {isAIProcessing && (
              <div className="flex items-center space-x-2 text-sm text-blue-600 dark:text-blue-400">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <span>AI analyzing...</span>
              </div>
            )}

            {/* Header Control Icons */}
            <div className="flex items-center space-x-1 border-l border-slate-200 dark:border-zinc-800 pl-3">
              <Tooltip content="Plugin Manager" position="bottom">
                <button
                  onClick={() => setShowPluginManager(true)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-slate-500 dark:text-zinc-400"
                >
                  <Package className="w-4 h-4" />
                </button>
              </Tooltip>
              
              <Tooltip content="Branch Manager" position="bottom">
                <button
                  data-tour="branch-manager-btn"
                  onClick={() => setShowBranchManager(true)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-slate-500 dark:text-zinc-400"
                >
                  <GitBranch className="w-4 h-4" />
                </button>
              </Tooltip>
              
              <Tooltip content="Export Data JSON" position="bottom">
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
                  className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-slate-500 dark:text-zinc-400"
                >
                  <Database className="w-4 h-4" />
                </button>
              </Tooltip>
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

        {/* AI Insights Sidebar */}
        <div className="w-80 border-l border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 overflow-y-auto transition-colors duration-200">
          <div className="space-y-4">
            <AIInsightsPanel />
            
            {/* Quick Actions */}
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg p-4 transition-colors">
              <h3 className="text-sm font-medium text-slate-800 dark:text-zinc-200 mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setShowSmartCardCreator(true)}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/40 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                >
                  <Zap className="w-4 h-4" />
                  <span>Create Smart Card</span>
                </button>
                <button
                  onClick={() => setShowBranchManager(true)}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/40 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-zinc-100">Plugin Manager</h2>
              <button
                onClick={() => setShowPluginManager(false)}
                className="p-2 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-zinc-100">Branch Manager</h2>
              <button
                onClick={() => setShowBranchManager(false)}
                className="p-2 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg"
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

      {/* Guided Product Tour */}
      <GuidedTour
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
      />
    </div>
  );
};