import React, { createContext, useContext, useState, useEffect } from 'react';
import { aiService } from '../services/AIService';

interface AIContextType {
  isProcessing: boolean;
  insights: string | null;
  workflowInsights: any[];
  velocityPrediction: any | null;
  taskSuggestions: string[];
  generateInsights: () => void;
  scorePriority: (taskDescription: string) => Promise<'low' | 'medium' | 'high'>;
  analyzeTask: (title: string, description: string) => Promise<any>;
  findSimilarTasks: (task: string, historical: any[]) => Promise<any[]>;
  generateTaskSuggestions: (context: any) => Promise<string[]>;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export const AIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [insights, setInsights] = useState<string | null>(null);
  const [workflowInsights, setWorkflowInsights] = useState<any[]>([]);
  const [velocityPrediction, setVelocityPrediction] = useState<any | null>(null);
  const [taskSuggestions, setTaskSuggestions] = useState<string[]>([]);

  useEffect(() => {
    // Initialize AI service
    aiService.initialize().catch(console.error);
  }, []);

  const generateInsights = async () => {
    setIsProcessing(true);
    
    try {
      // Mock data for demonstration
      const mockCards = [
        { id: '1', title: 'Fix login bug', columnId: 'in-progress', updatedAt: Date.now() - 86400000 },
        { id: '2', title: 'Add user dashboard', columnId: 'review', updatedAt: Date.now() - 172800000 }
      ];
      
      const mockEvents = [
        { type: 'CARD_MOVED', payload: { toColumn: 'done' }, timestamp: Date.now() - 86400000 }
      ];

      const mockCompletedCards = [
        { id: '3', title: 'Implement authentication', description: 'Add user login and registration', columnId: 'done', updatedAt: Date.now() - 259200000 },
        { id: '4', title: 'Setup CI/CD pipeline', description: 'Configure automated testing and deployment', columnId: 'done', updatedAt: Date.now() - 345600000 }
      ];

      // Generate comprehensive insights
      const [workflowAnalysis, prediction, suggestions] = await Promise.all([
        aiService.generateWorkflowInsights(mockCards, mockEvents),
        aiService.predictCompletion(mockCards, mockEvents),
        aiService.generateTaskSuggestions({
          recentCards: mockCards,
          completedCards: mockCompletedCards
        })
      ]);

      setWorkflowInsights(workflowAnalysis);
      setVelocityPrediction(prediction);
      setTaskSuggestions(suggestions);
      
      // Set primary insight
      if (workflowAnalysis.length > 0) {
        setInsights(workflowAnalysis[0].description);
      }
    } catch (error) {
      console.error('AI insight generation failed:', error);
      setInsights('AI analysis temporarily unavailable');
    }
    
    setIsProcessing(false);
  };

  const scorePriority = async (taskDescription: string): Promise<'low' | 'medium' | 'high'> => {
    try {
      const analysis = await aiService.analyzeTask(taskDescription, '');
      return analysis.priority;
    } catch (error) {
      console.error('Priority scoring failed:', error);
      return 'medium';
    }
  };

  const analyzeTask = async (title: string, description: string) => {
    return await aiService.analyzeTask(title, description);
  };

  const findSimilarTasks = async (task: string, historical: any[]) => {
    return await aiService.findSimilarTasks(task, historical);
  };

  const generateTaskSuggestions = async (context: any) => {
    return await aiService.generateTaskSuggestions(context);
  };

  // Auto-generate insights periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isProcessing && workflowInsights.length === 0 && Math.random() > 0.8) {
        generateInsights();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isProcessing, workflowInsights]);

  return (
    <AIContext.Provider value={{
      isProcessing,
      insights,
      workflowInsights,
      velocityPrediction,
      taskSuggestions,
      generateInsights,
      scorePriority,
      analyzeTask,
      findSimilarTasks,
      generateTaskSuggestions
    }}>
      {children}
    </AIContext.Provider>
  );
};

export const useAI = () => {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within AIProvider');
  }
  return context;
};