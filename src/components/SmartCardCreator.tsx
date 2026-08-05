import React, { useState, useEffect } from 'react';
import { Plus, Brain, Clock, Target, Users, Sparkles } from 'lucide-react';
import { aiService } from '../services/AIService';
import { useKanbanStore } from '../store/useKanbanStore';

interface SmartCardCreatorProps {
  onCreateCard: (card: any) => void;
  onClose: () => void;
}

export const SmartCardCreator: React.FC<SmartCardCreatorProps> = ({ onCreateCard, onClose }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [analysis, setAnalysis] = useState<any>(null);
  const [similarTasks, setSimilarTasks] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const existingCards = useKanbanStore((state) => state.cards);

  useEffect(() => {
    const analyzeInput = async () => {
      if (title.length < 3) return;

      setIsAnalyzing(true);
      try {
        const [taskAnalysis, similar] = await Promise.all([
          aiService.analyzeTask(title, description),
          aiService.findSimilarTasks(`${title} ${description}`, existingCards)
        ]);

        setAnalysis(taskAnalysis);
        setSimilarTasks(similar);
      } catch (error) {
        console.error('Task analysis failed:', error);
      } finally {
        setIsAnalyzing(false);
      }
    };

    const debounceTimer = setTimeout(analyzeInput, 500);
    return () => clearTimeout(debounceTimer);
  }, [title, description, existingCards]);

  const handleCreate = () => {
    const card = {
      id: Date.now().toString(),
      title,
      description,
      priority: analysis?.priority || 'medium',
      assignee: 'You',
      tags: [analysis?.category || 'General'],
      columnId: 'backlog',
      position: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      conflicts: [],
      estimatedHours: analysis?.estimatedHours,
      complexity: analysis?.complexity,
      aiGenerated: true
    };

    onCreateCard(card);
    onClose();
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'complex': return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'moderate': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'simple': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Smart Card Creator</h2>
              <p className="text-sm text-slate-600">AI-powered task analysis and suggestions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Input Fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Task Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Fix login authentication bug"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide additional context, requirements, or acceptance criteria..."
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              />
            </div>
          </div>

          {/* AI Analysis */}
          {(isAnalyzing || analysis) && (
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Brain className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-medium text-slate-800">AI Analysis</h3>
                {isAnalyzing && (
                  <div className="flex items-center space-x-2 text-xs text-blue-600">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                    <span>Analyzing...</span>
                  </div>
                )}
              </div>

              {analysis && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <Target className="w-3 h-3 text-slate-500" />
                        <span className="text-xs font-medium text-slate-600">Priority</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full border ${getPriorityColor(analysis.priority)}`}>
                        {analysis.priority.charAt(0).toUpperCase() + analysis.priority.slice(1)}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <Users className="w-3 h-3 text-slate-500" />
                        <span className="text-xs font-medium text-slate-600">Category</span>
                      </div>
                      <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                        {analysis.category}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span className="text-xs font-medium text-slate-600">Estimated Time</span>
                      </div>
                      <span className="text-xs text-slate-700">
                        {analysis.estimatedHours}h
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <Brain className="w-3 h-3 text-slate-500" />
                        <span className="text-xs font-medium text-slate-600">Complexity</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full border ${getComplexityColor(analysis.complexity)}`}>
                        {analysis.complexity.charAt(0).toUpperCase() + analysis.complexity.slice(1)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {analysis?.dependencies?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <h4 className="text-xs font-medium text-slate-600 mb-2">Dependencies Detected</h4>
                  <div className="space-y-1">
                    {analysis.dependencies.map((dep: string, index: number) => (
                      <div key={index} className="text-xs text-amber-600 flex items-center space-x-1">
                        <span>⚠</span>
                        <span>{dep}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Similar Tasks */}
          {similarTasks.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-slate-800 mb-3 flex items-center space-x-2">
                <Target className="w-4 h-4 text-blue-600" />
                <span>Similar Tasks Found</span>
              </h3>
              <div className="space-y-2">
                {similarTasks.map((task, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">
                        {task.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {Math.round(task.similarity * 100)}% similar
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!title.trim()}
              className="flex items-center space-x-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Create Smart Card</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};