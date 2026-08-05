import React, { useState } from 'react';
import { User, Clock, AlertTriangle, GitMerge, Tag } from 'lucide-react';

interface CardProps {
  card: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    assignee: string;
    tags: string[];
    lastModified: Date;
    conflicts: any[];
  };
}

export const Card: React.FC<CardProps> = ({ card }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const priorityColors = {
    low: 'bg-green-100 text-green-700 border-green-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    high: 'bg-red-100 text-red-700 border-red-200'
  };

  const priorityIcons = {
    low: '●',
    medium: '●●',
    high: '●●●'
  };

  return (
    <div 
      className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-medium text-slate-800 flex-1 pr-2">
          {card.title}
        </h4>
        {card.conflicts.length > 0 && (
          <GitMerge className="w-4 h-4 text-amber-500 flex-shrink-0" />
        )}
      </div>

      {/* Card Description */}
      {isExpanded && (
        <p className="text-xs text-slate-600 mb-3 leading-relaxed">
          {card.description}
        </p>
      )}

      {/* Priority Badge */}
      <div className="flex items-center justify-between mb-2">
        <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs border ${priorityColors[card.priority]}`}>
          <span>{priorityIcons[card.priority]}</span>
          <span className="capitalize">{card.priority}</span>
        </div>
        
        {card.conflicts.length > 0 && (
          <div className="flex items-center space-x-1 text-xs text-amber-600">
            <AlertTriangle className="w-3 h-3" />
            <span>{card.conflicts.length} conflicts</span>
          </div>
        )}
      </div>

      {/* Tags */}
      {card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {card.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center space-x-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs"
            >
              <Tag className="w-3 h-3" />
              <span>{tag}</span>
            </span>
          ))}
        </div>
      )}

      {/* Card Footer */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center space-x-1">
          <User className="w-3 h-3" />
          <span>{card.assignee}</span>
        </div>
        <div className="flex items-center space-x-1">
          <Clock className="w-3 h-3" />
          <span>{card.lastModified.toLocaleDateString()}</span>
        </div>
      </div>

      {/* Expanded Actions */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end space-x-2">
          <button className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded">
            Edit
          </button>
          <button className="px-2 py-1 text-xs text-blue-600 hover:text-blue-700 border border-blue-200 rounded hover:bg-blue-50">
            History
          </button>
          <button className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600">
            Commit
          </button>
        </div>
      )}
    </div>
  );
};