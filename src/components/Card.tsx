import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Clock, AlertTriangle, GitMerge, Tag, PlusCircle, RefreshCw, Trash2, Edit3 } from 'lucide-react';
import { CardDetailModal } from './CardDetailModal';

interface CardProps {
  card: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    assignee: string;
    tags: string[];
    columnId: string;
    lastModified: Date;
    conflicts: any[];
  };
  diffStatus?: 'added' | 'modified' | 'deleted';
}

export const Card: React.FC<CardProps> = ({ card, diffStatus }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const priorityColors = {
    low: 'bg-green-100 dark:bg-emerald-950/60 text-green-700 dark:text-emerald-300 border-green-200 dark:border-emerald-800',
    medium: 'bg-yellow-100 dark:bg-amber-950/60 text-yellow-700 dark:text-amber-300 border-yellow-200 dark:border-amber-800',
    high: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
  };

  const priorityIcons = {
    low: '●',
    medium: '●●',
    high: '●●●'
  };

  const getDiffClasses = () => {
    switch (diffStatus) {
      case 'added':
        return 'ring-2 ring-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800';
      case 'modified':
        return 'ring-2 ring-amber-500 bg-amber-50/70 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800';
      case 'deleted':
        return 'ring-2 ring-red-400 bg-red-50/60 dark:bg-red-950/30 opacity-60 pointer-events-none border-dashed border-red-300 dark:border-red-800';
      default:
        return 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 hover:shadow-md dark:hover:border-zinc-700';
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (diffStatus === 'deleted') return;
    // Single click toggles inline expand, double click or edit opens full Markdown Modal
    if (e.detail === 2) {
      setIsModalOpen(true);
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <>
      <div 
        className={`border rounded-lg p-3 shadow-sm transition-all cursor-pointer group ${getDiffClasses()}`}
        onClick={handleCardClick}
      >
        {/* Card Header & Diff Badge */}
        <div className="flex items-start justify-between mb-2">
          <h4 className="text-sm font-medium text-slate-800 dark:text-zinc-100 flex-1 pr-2">
            {card.title}
          </h4>
          <div className="flex items-center space-x-1">
            {diffStatus === 'added' && (
              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                <PlusCircle className="w-3 h-3" />
                <span>+ Added</span>
              </span>
            )}
            {diffStatus === 'modified' && (
              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                <RefreshCw className="w-3 h-3" />
                <span>~ Modified</span>
              </span>
            )}
            {diffStatus === 'deleted' && (
              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700">
                <Trash2 className="w-3 h-3" />
                <span>- Deleted</span>
              </span>
            )}
            {card.conflicts && card.conflicts.length > 0 && (
              <GitMerge className="w-4 h-4 text-amber-500 flex-shrink-0" />
            )}
          </div>
        </div>

        {/* Card Description (Rendered Markdown preview when expanded) */}
        {isExpanded && card.description && (
          <div className="text-xs text-slate-600 dark:text-zinc-300 mb-3 leading-relaxed border-t border-slate-100 dark:border-zinc-800/80 pt-2">
            <div className="prose dark:prose-invert max-w-none text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{card.description}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Priority Badge */}
        <div className="flex items-center justify-between mb-2">
          <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs border ${priorityColors[card.priority]}`}>
            <span>{priorityIcons[card.priority]}</span>
            <span className="capitalize">{card.priority}</span>
          </div>
          
          {card.conflicts && card.conflicts.length > 0 && (
            <div className="flex items-center space-x-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              <span>{card.conflicts.length} conflicts</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {card.tags && card.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {card.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center space-x-1 px-2 py-0.5 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-transparent dark:border-zinc-700/60 rounded text-xs"
              >
                <Tag className="w-3 h-3" />
                <span>{tag}</span>
              </span>
            ))}
          </div>
        )}

        {/* Card Footer */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
          <div className="flex items-center space-x-1">
            <User className="w-3 h-3" />
            <span>{card.assignee}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Clock className="w-3 h-3" />
            <span>{card.lastModified ? card.lastModified.toLocaleDateString() : 'N/A'}</span>
          </div>
        </div>

        {/* Expanded Actions */}
        {isExpanded && diffStatus !== 'deleted' && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800 flex justify-end space-x-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsModalOpen(true);
              }}
              className="flex items-center space-x-1 px-2 py-1 text-xs text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100 border border-slate-200 dark:border-zinc-700 rounded hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <Edit3 className="w-3 h-3" />
              <span>Edit / Markdown</span>
            </button>
          </div>
        )}
      </div>

      {/* Card Detail & Markdown Modal */}
      {isModalOpen && (
        <CardDetailModal
          card={card}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </>
  );
};