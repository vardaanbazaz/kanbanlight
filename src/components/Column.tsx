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
    slate: 'bg-slate-100 border-slate-200',
    blue: 'bg-blue-50 border-blue-200',
    amber: 'bg-amber-50 border-amber-200',
    purple: 'bg-purple-50 border-purple-200',
    emerald: 'bg-emerald-50 border-emerald-200'
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
      <div className={`rounded-t-lg border-2 ${colorClasses[color as keyof typeof colorClasses]} p-4`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <h3 className="font-semibold text-slate-800">{title}</h3>
            <span className="text-xs bg-white bg-opacity-60 text-slate-600 px-2 py-1 rounded-full">
              {cards.length + deletedCardsInColumn.length}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <button className="p-1 hover:bg-white hover:bg-opacity-50 rounded">
              <GitCommit className="w-4 h-4 text-slate-500" />
            </button>
            <button className="p-1 hover:bg-white hover:bg-opacity-50 rounded">
              <MoreHorizontal className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Cards Container */}
      <div className="flex-1 bg-white border-l-2 border-r-2 border-slate-200 p-4 space-y-3 overflow-y-auto">
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
          <div className="bg-white border-2 border-dashed border-slate-300 rounded-lg p-3">
            <input
              type="text"
              value={newCardTitle}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCardTitle(e.target.value)}
              placeholder="Enter card title..."
              className="w-full text-sm border-none outline-none resize-none"
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') handleAddCard();
                if (e.key === 'Escape') setIsAddingCard(false);
              }}
              autoFocus
            />
            <div className="flex justify-end space-x-2 mt-2">
              <button
                onClick={() => setIsAddingCard(false)}
                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCard}
                className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Add
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingCard(true)}
            className="w-full p-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">Add card</span>
          </button>
        )}
      </div>

      {/* Column Footer */}
      <div className={`rounded-b-lg border-2 border-t-0 ${colorClasses[color as keyof typeof colorClasses]} p-2`}>
        <div className="text-xs text-slate-500 text-center">
          Last sync: just now
        </div>
      </div>
    </div>
  );
};