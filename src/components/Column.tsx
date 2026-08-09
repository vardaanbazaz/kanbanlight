import React, { useState } from 'react';
import { Plus, MoreHorizontal, GitCommit } from 'lucide-react';
import { Card } from './Card';
import { useKanbanStore } from '../store/useKanbanStore';

interface ColumnProps {
  id: string;
  title: string;
  color: string;
}

export const Column: React.FC<ColumnProps> = ({ id, title, color }) => {
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  
  const cards = useKanbanStore((state) => 
    state.cards
      .filter((card) => card.columnId === id)
      .map((card) => ({
        ...card,
        lastModified: new Date(card.updatedAt || card.createdAt),
      }))
  );

  const isDiffModeActive = useKanbanStore((state) => state.isDiffModeActive);
  const branchDiff = useKanbanStore((state) => state.branchDiff);
  const createCard = useKanbanStore((state) => state.createCard);

  const addedIds = new Set(branchDiff?.addedCards.map((c) => c.id) || []);
  const modifiedIds = new Set(branchDiff?.modifiedCards.map((c) => c.id) || []);

  const deletedCardsInColumn = isDiffModeActive && branchDiff
    ? branchDiff.deletedCards
        .filter((card) => card.columnId === id)
        .map((card) => ({
          ...card,
          lastModified: new Date(card.updatedAt || card.createdAt),
          conflicts: card.conflicts || [],
          tags: card.tags || [],
        }))
    : [];

  const colorClasses = {
    slate: 'bg-slate-100 dark:bg-zinc-800/90 border-slate-200 dark:border-zinc-700/80',
    blue: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60',
    amber: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60',
    purple: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900/60',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60'
  };

  const handleAddCard = async () => {
    if (newCardTitle.trim()) {
      await createCard(newCardTitle.trim(), id);
      setNewCardTitle('');
      setIsAddingCard(false);
    }
  };

  return (
    <div className="flex flex-col w-80 h-full">
      {/* Column Header */}
      <div className={`rounded-t-lg border-2 ${colorClasses[color as keyof typeof colorClasses]} p-4 transition-colors`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <h3 className="font-semibold text-slate-800 dark:text-zinc-100">{title}</h3>
            <span className="text-xs bg-white/70 dark:bg-zinc-900/70 text-slate-600 dark:text-zinc-300 px-2 py-1 rounded-full border border-slate-200/50 dark:border-zinc-700/50">
              {cards.length + deletedCardsInColumn.length}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <button className="p-1 hover:bg-white/50 dark:hover:bg-zinc-800/50 rounded text-slate-500 dark:text-zinc-400">
              <GitCommit className="w-4 h-4" />
            </button>
            <button className="p-1 hover:bg-white/50 dark:hover:bg-zinc-800/50 rounded text-slate-500 dark:text-zinc-400">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Cards Container */}
      <div className="flex-1 bg-white dark:bg-zinc-900/90 border-l-2 border-r-2 border-slate-200 dark:border-zinc-800 p-4 space-y-3 overflow-y-auto transition-colors">
        {cards.map((card: any) => {
          let diffStatus: 'added' | 'modified' | 'deleted' | undefined;
          if (isDiffModeActive) {
            if (addedIds.has(card.id)) diffStatus = 'added';
            else if (modifiedIds.has(card.id)) diffStatus = 'modified';
          }
          return <Card key={card.id} card={card} diffStatus={diffStatus} />;
        })}

        {/* Deleted Cards (Ghosted) */}
        {deletedCardsInColumn.map((card: any) => (
          <Card key={`deleted-${card.id}`} card={card} diffStatus="deleted" />
        ))}

        {/* Add Card */}
        {isAddingCard ? (
          <div className="bg-white dark:bg-zinc-800 border-2 border-dashed border-slate-300 dark:border-zinc-700 rounded-lg p-3">
            <input
              type="text"
              value={newCardTitle}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCardTitle(e.target.value)}
              placeholder="Enter card title..."
              className="w-full text-sm bg-transparent border-none outline-none text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 resize-none"
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') handleAddCard();
                if (e.key === 'Escape') setIsAddingCard(false);
              }}
              autoFocus
            />
            <div className="flex justify-end space-x-2 mt-2">
              <button
                onClick={() => setIsAddingCard(false)}
                className="px-2 py-1 text-xs text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCard}
                className="px-3 py-1 text-xs bg-blue-500 dark:bg-blue-600 text-white rounded hover:bg-blue-600 dark:hover:bg-blue-500"
              >
                Add
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingCard(true)}
            className="w-full p-3 border-2 border-dashed border-slate-300 dark:border-zinc-800 rounded-lg text-slate-500 dark:text-zinc-400 hover:border-slate-400 dark:hover:border-zinc-700 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors flex items-center justify-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">Add card</span>
          </button>
        )}
      </div>

      {/* Column Footer */}
      <div className={`rounded-b-lg border-2 border-t-0 ${colorClasses[color as keyof typeof colorClasses]} p-2 transition-colors`}>
        <div className="text-xs text-slate-500 dark:text-zinc-400 text-center">
          Last sync: just now
        </div>
      </div>
    </div>
  );
};