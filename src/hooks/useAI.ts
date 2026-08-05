import { useKanbanStore } from '../store/useKanbanStore';
import { aiService } from '../services/AIService';

export const useAI = () => {
  const isProcessing = useKanbanStore((state) => state.isAIProcessing);
  const insights = useKanbanStore((state) => state.insights);
  const workflowInsights = useKanbanStore((state) => state.workflowInsights);
  const velocityPrediction = useKanbanStore((state) => state.velocityPrediction);
  const taskSuggestions = useKanbanStore((state) => state.taskSuggestions);
  const generateInsights = useKanbanStore((state) => state.generateAIInsights);

  return {
    isProcessing,
    insights,
    workflowInsights,
    velocityPrediction,
    taskSuggestions,
    generateInsights,
    scorePriority: async (taskDescription: string) => {
      const analysis = await aiService.analyzeTask(taskDescription, '');
      return analysis.priority;
    },
    analyzeTask: (title: string, description: string) => aiService.analyzeTask(title, description),
    findSimilarTasks: (task: string, historical: any[]) => aiService.findSimilarTasks(task, historical),
    generateTaskSuggestions: (context: any) => aiService.generateTaskSuggestions(context)
  };
};