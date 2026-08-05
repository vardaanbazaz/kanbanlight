import React from 'react';
import { AlertTriangle, GitMerge, X } from 'lucide-react';

interface Conflict {
  id: string;
  type: 'card_move' | 'card_edit' | 'column_change';
  description: string;
  localChange: any;
  remoteChange: any;
  timestamp: number;
}

interface ConflictResolutionModalProps {
  conflicts: Conflict[];
  onResolve: (conflictId: string, resolution: 'local' | 'remote' | 'merge') => void;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  conflicts,
  onResolve
}) => {
  const currentConflict = conflicts[0];

  if (!currentConflict) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-amber-50">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                Merge Conflict Detected
              </h2>
              <p className="text-sm text-slate-600">
                {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} need resolution
              </p>
            </div>
          </div>
          <button className="p-2 hover:bg-amber-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Conflict Details */}
        <div className="p-6">
          <div className="mb-6">
            <h3 className="text-md font-medium text-slate-800 mb-2">
              {currentConflict.description}
            </h3>
            <p className="text-sm text-slate-600">
              Two users made conflicting changes simultaneously. Choose how to resolve:
            </p>
          </div>

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Local Changes */}
            <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <h4 className="font-medium text-blue-800">Your Changes</h4>
              </div>
              <div className="bg-white rounded p-3 text-sm">
                <pre className="whitespace-pre-wrap text-slate-700">
                  {JSON.stringify(currentConflict.localChange, null, 2)}
                </pre>
              </div>
            </div>

            {/* Remote Changes */}
            <div className="border border-green-200 rounded-lg p-4 bg-green-50">
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <h4 className="font-medium text-green-800">Their Changes</h4>
              </div>
              <div className="bg-white rounded p-3 text-sm">
                <pre className="whitespace-pre-wrap text-slate-700">
                  {JSON.stringify(currentConflict.remoteChange, null, 2)}
                </pre>
              </div>
            </div>
          </div>

          {/* Resolution Options */}
          <div className="flex justify-center space-x-4">
            <button
              onClick={() => onResolve(currentConflict.id, 'local')}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <span>Keep Mine</span>
            </button>
            
            <button
              onClick={() => onResolve(currentConflict.id, 'remote')}
              className="flex items-center space-x-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              <span>Keep Theirs</span>
            </button>
            
            <button
              onClick={() => onResolve(currentConflict.id, 'merge')}
              className="flex items-center space-x-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
            >
              <GitMerge className="w-4 h-4" />
              <span>Smart Merge</span>
            </button>
          </div>
        </div>

        {/* Progress */}
        {conflicts.length > 0 && (
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>
                1 of {conflicts.length} remaining
              </span>
              <div className="w-32 bg-slate-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${(1 / conflicts.length) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};