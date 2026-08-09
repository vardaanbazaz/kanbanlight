import React, { useState, useEffect } from 'react';
import { Search, Terminal, GitBranch, Zap, Users } from 'lucide-react';
import { useKanbanStore } from '../store/useKanbanStore';

export const CommandPalette: React.FC = () => {
  const isOpen = useKanbanStore((state) => state.isCommandPaletteOpen);
  const setIsOpen = useKanbanStore((state) => state.setCommandPaletteOpen);
  const setShowSmartCardCreator = useKanbanStore((state) => state.setShowSmartCardCreator);
  const setShowBranchManager = useKanbanStore((state) => state.setShowBranchManager);
  const setShowPluginManager = useKanbanStore((state) => state.setShowPluginManager);
  const generateAIInsights = useKanbanStore((state) => state.generateAIInsights);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands = [
    {
      id: 'create-card',
      title: 'Create smart card',
      description: 'Add a new AI-analyzed task to the board',
      icon: <Terminal className="w-4 h-4" />,
      shortcut: 'Ctrl+N',
      category: 'Actions',
      action: () => setShowSmartCardCreator(true),
    },
    {
      id: 'create-branch',
      title: 'Manage branches',
      description: 'Create or merge board branches',
      icon: <GitBranch className="w-4 h-4" />,
      shortcut: 'Ctrl+B',
      category: 'Git',
      action: () => setShowBranchManager(true),
    },
    {
      id: 'ai-insights',
      title: 'Generate AI insights',
      description: 'Analyze board for optimization suggestions',
      icon: <Zap className="w-4 h-4" />,
      shortcut: 'Ctrl+I',
      category: 'AI',
      action: () => generateAIInsights(),
    },
    {
      id: 'plugin-manager',
      title: 'Open Plugin Manager',
      description: 'Manage WebAssembly plugins',
      icon: <Users className="w-4 h-4" />,
      shortcut: 'Ctrl+P',
      category: 'Plugins',
      action: () => setShowPluginManager(true),
    },
  ];

  const filteredCommands = commands.filter(cmd =>
    cmd.title.toLowerCase().includes(query.toLowerCase()) ||
    cmd.description.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            executeCommand(filteredCommands[selectedIndex]);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setQuery('');
        setSelectedIndex(0);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [setIsOpen]);

  const executeCommand = (cmd: typeof commands[0]) => {
    setIsOpen(false);
    if (cmd && cmd.action) {
      cmd.action();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-32 z-50">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg shadow-2xl w-full max-w-2xl mx-4 overflow-hidden transition-colors">
        {/* Search Input */}
        <div className="flex items-center px-4 py-3 border-b border-slate-200 dark:border-zinc-800">
          <Search className="w-5 h-5 text-slate-400 dark:text-zinc-500 mr-3" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent outline-none text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 text-sm"
            autoFocus
          />
          <button
            onClick={() => setIsOpen(false)}
            className="text-xs text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 ml-3"
          >
            ESC to close
          </button>
        </div>

        {/* Commands List */}
        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800/40">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-500 dark:text-zinc-400 text-sm">
              No commands found
            </div>
          ) : (
            filteredCommands.map((command, index) => (
              <div
                key={command.id}
                className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${
                  index === selectedIndex
                    ? 'bg-blue-50 dark:bg-blue-950/50 border-r-2 border-blue-500 dark:border-blue-400'
                    : 'hover:bg-slate-50 dark:hover:bg-zinc-800/60'
                }`}
                onClick={() => executeCommand(command)}
              >
                <div className="flex items-center space-x-3 flex-1">
                  <div className="text-slate-600 dark:text-zinc-400">
                    {command.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800 dark:text-zinc-100">
                      {command.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-zinc-400">
                      {command.description}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 px-2 py-1 rounded border border-slate-200/50 dark:border-zinc-700/50">
                    {command.category}
                  </span>
                  {command.shortcut && (
                    <span className="text-xs text-slate-400 dark:text-zinc-500 font-mono">
                      {command.shortcut}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-zinc-950/60 border-t border-slate-200 dark:border-zinc-800 text-xs text-slate-500 dark:text-zinc-400 flex justify-between">
          <span>↑↓ to navigate</span>
          <span>↵ to select</span>
        </div>
      </div>
    </div>
  );
};