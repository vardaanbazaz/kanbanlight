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
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3">
          <Brain className="w-5 h-5 text-purple-600" />
          <h3 className="font-medium text-slate-800">AI Insights</h3>
          {isProcessing && (
            <div className="flex items-center space-x-2 text-sm text-blue-600">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span>Analyzing...</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {workflowInsights.length > 0 && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
              {workflowInsights.length} insights
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              generateInsights();
            }}
            disabled={isProcessing}
            className="p-1 hover:bg-slate-100 rounded transition-colors disabled:opacity-50"
          >
            <Brain className="w-4 h-4 text-slate-500" />
          </button>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-slate-200">
          {/* Workflow Insights */}
          {workflowInsights.length > 0 && (
            <div className="p-4 border-b border-slate-100">
              <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center space-x-2">
                <TrendingUp className="w-4 h-4" />
                <span>Workflow Analysis</span>
              </h4>
              <div className="space-y-3">
                {workflowInsights.slice(0, 3).map((insight, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    {getInsightIcon(insight.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h5 className="text-sm font-medium text-slate-800">
                          {insight.title}
                        </h5>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${getImpactColor(insight.impact)}`}>
                          {insight.impact} impact
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {insight.description}
                      </p>
                      <div className="flex items-center space-x-2 mt-2">
                        <div className="text-xs text-slate-500">
                          Confidence: {Math.round(insight.confidence * 100)}%
                        </div>
                        {insight.actionable && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
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
            <div className="p-4 border-b border-slate-100">
              <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center space-x-2">
                <Clock className="w-4 h-4" />
                <span>Completion Prediction</span>
              </h4>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600">Estimated completion:</span>
                  <span className="text-sm font-medium text-slate-800">
                    {new Date(velocityPrediction.completionDate).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-slate-600">Confidence:</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 bg-slate-200 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${velocityPrediction.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">
                      {Math.round(velocityPrediction.confidence * 100)}%
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-600 font-medium">Factors:</p>
                  {velocityPrediction.factors.map((factor: string, index: number) => (
                    <p key={index} className="text-xs text-slate-500 ml-2">
                      • {factor}
                    </p>
                  ))}
                </div>
                {velocityPrediction.risks.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs text-amber-600 font-medium">Risks:</p>
                    {velocityPrediction.risks.map((risk: string, index: number) => (
                      <p key={index} className="text-xs text-amber-600 ml-2">
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
              <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center space-x-2">
                <Lightbulb className="w-4 h-4" />
                <span>Suggested Tasks</span>
              </h4>
              <div className="space-y-2">
                {taskSuggestions.map((suggestion, index) => (
                  <div key={index} className="flex items-start space-x-2">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-xs text-slate-600 leading-relaxed">
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
              <Brain className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500 mb-3">
                No insights available yet
              </p>
              <button
                onClick={generateInsights}
                className="text-xs bg-purple-500 text-white px-3 py-1.5 rounded-lg hover:bg-purple-600 transition-colors"
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