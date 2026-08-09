import React, { useState } from 'react';
import { Brain, TrendingUp, Clock, Target, Lightbulb, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { useKanbanStore } from '../store/useKanbanStore';

export const AIInsightsPanel: React.FC = () => {
  const isProcessing = useKanbanStore((state) => state.isAIProcessing);
  const workflowInsights = useKanbanStore((state) => state.workflowInsights);
  const velocityPrediction = useKanbanStore((state) => state.velocityPrediction);
  const taskSuggestions = useKanbanStore((state) => state.taskSuggestions);
  const generateInsights = useKanbanStore((state) => state.generateAIInsights);

  const [isExpanded, setIsExpanded] = useState(false);

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'bottleneck': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'optimization': return <Target className="w-4 h-4 text-blue-500" />;
      case 'prediction': return <TrendingUp className="w-4 h-4 text-purple-500" />;
      case 'anomaly': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default: return <Lightbulb className="w-4 h-4 text-green-500" />;
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800';
      case 'medium': return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800';
      case 'low': return 'text-green-600 dark:text-emerald-400 bg-green-50 dark:bg-emerald-950/40 border-green-200 dark:border-emerald-800';
      default: return 'text-slate-600 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700';
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg shadow-sm transition-colors duration-200">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3">
          <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <h3 className="font-medium text-slate-800 dark:text-zinc-100">AI Insights</h3>
          {isProcessing && (
            <div className="flex items-center space-x-2 text-sm text-blue-600 dark:text-blue-400">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span>Analyzing...</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {workflowInsights.length > 0 && (
            <span className="text-xs bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-full border border-purple-200/50 dark:border-purple-800/50">
              {workflowInsights.length} insights
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              generateInsights();
            }}
            disabled={isProcessing}
            className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors disabled:opacity-50 text-slate-500 dark:text-zinc-400"
          >
            <Brain className="w-4 h-4" />
          </button>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400 dark:text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 dark:text-zinc-500" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-zinc-800">
          {/* Workflow Insights */}
          {workflowInsights.length > 0 && (
            <div className="p-4 border-b border-slate-100 dark:border-zinc-800/60">
              <h4 className="text-sm font-medium text-slate-700 dark:text-zinc-200 mb-3 flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-purple-500" />
                <span>Workflow Analysis</span>
              </h4>
              <div className="space-y-3">
                {workflowInsights.slice(0, 3).map((insight, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    {getInsightIcon(insight.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h5 className="text-sm font-medium text-slate-800 dark:text-zinc-100">
                          {insight.title}
                        </h5>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${getImpactColor(insight.impact)}`}>
                          {insight.impact} impact
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                        {insight.description}
                      </p>
                      <div className="flex items-center space-x-2 mt-2">
                        <div className="text-xs text-slate-500 dark:text-zinc-400">
                          Confidence: {Math.round(insight.confidence * 100)}%
                        </div>
                        {insight.actionable && (
                          <span className="text-xs bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                            Actionable
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Velocity Prediction */}
          {velocityPrediction && (
            <div className="p-4 border-b border-slate-100 dark:border-zinc-800/60">
              <h4 className="text-sm font-medium text-slate-700 dark:text-zinc-200 mb-3 flex items-center space-x-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <span>Completion Prediction</span>
              </h4>
              <div className="bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/50 dark:border-zinc-700/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600 dark:text-zinc-300">Estimated completion:</span>
                  <span className="text-sm font-medium text-slate-800 dark:text-zinc-100">
                    {new Date(velocityPrediction.completionDate).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-slate-600 dark:text-zinc-300">Confidence:</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 bg-slate-200 dark:bg-zinc-700 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${velocityPrediction.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      {Math.round(velocityPrediction.confidence * 100)}%
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-600 dark:text-zinc-300 font-medium">Factors:</p>
                  {velocityPrediction.factors.map((factor: string, index: number) => (
                    <p key={index} className="text-xs text-slate-500 dark:text-zinc-400 ml-2">
                      • {factor}
                    </p>
                  ))}
                </div>
                {velocityPrediction.risks.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Risks:</p>
                    {velocityPrediction.risks.map((risk: string, index: number) => (
                      <p key={index} className="text-xs text-amber-600 dark:text-amber-400 ml-2">
                        ⚠ {risk}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Task Suggestions */}
          {taskSuggestions.length > 0 && (
            <div className="p-4">
              <h4 className="text-sm font-medium text-slate-700 dark:text-zinc-200 mb-3 flex items-center space-x-2">
                <Lightbulb className="w-4 h-4 text-emerald-500" />
                <span>Suggested Tasks</span>
              </h4>
              <div className="space-y-2">
                {taskSuggestions.map((suggestion, index) => (
                  <div key={index} className="flex items-start space-x-2">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                      {suggestion}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {workflowInsights.length === 0 && !velocityPrediction && taskSuggestions.length === 0 && !isProcessing && (
            <div className="p-8 text-center">
              <Brain className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-zinc-400 mb-3">
                No insights available yet
              </p>
              <button
                onClick={generateInsights}
                className="text-xs bg-purple-500 hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Generate AI Insights
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};