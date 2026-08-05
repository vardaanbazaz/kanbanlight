import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js to use local models
env.allowRemoteModels = false;
env.allowLocalModels = true;

interface TaskAnalysis {
  priority: 'low' | 'medium' | 'high';
  category: string;
  estimatedHours: number;
  complexity: 'simple' | 'moderate' | 'complex';
  dependencies: string[];
}

interface WorkflowInsight {
  type: 'bottleneck' | 'optimization' | 'prediction' | 'anomaly';
  title: string;
  description: string;
  confidence: number;
  actionable: boolean;
  impact: 'low' | 'medium' | 'high';
}

interface VelocityPrediction {
  completionDate: Date;
  confidence: number;
  factors: string[];
  risks: string[];
}

class AIService {
  private classifier: any = null;
  private embedder: any = null;
  private isInitialized = false;
  private modelCache = new Map();

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('🧠 Initializing AI models...');
      
      // Initialize text classification pipeline
      this.classifier = await pipeline(
        'text-classification',
        'Xenova/distilbert-base-uncased-finetuned-sst-2-english'
      );

      // Initialize embedding pipeline for semantic similarity
      this.embedder = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
      );

      this.isInitialized = true;
      console.log('✅ AI models initialized successfully');
    } catch (error) {
      console.warn('⚠️ AI models failed to initialize, using fallback heuristics:', error);
      // Graceful degradation - use rule-based fallbacks
    }
  }

  async analyzeTask(title: string, description: string): Promise<TaskAnalysis> {
    const text = `${title} ${description}`.toLowerCase();
    
    // Priority analysis using keyword detection and ML classification
    const priority = await this.analyzePriority(text);
    
    // Category classification
    const category = this.categorizeTask(text);
    
    // Complexity estimation
    const complexity = this.estimateComplexity(text);
    
    // Time estimation based on historical patterns
    const estimatedHours = this.estimateEffort(text, complexity);
    
    // Dependency detection
    const dependencies = this.detectDependencies(text);

    return {
      priority,
      category,
      estimatedHours,
      complexity,
      dependencies
    };
  }

  private async analyzePriority(text: string): Promise<'low' | 'medium' | 'high'> {
    // High-priority keywords
    const urgentKeywords = [
      'urgent', 'critical', 'emergency', 'asap', 'immediately',
      'production', 'outage', 'security', 'vulnerability', 'breach',
      'deadline', 'blocker', 'blocking', 'broken', 'failing'
    ];

    // Medium-priority keywords
    const mediumKeywords = [
      'important', 'feature', 'enhancement', 'improvement',
      'optimization', 'refactor', 'update', 'upgrade'
    ];

    // Check for urgent indicators
    if (urgentKeywords.some(keyword => text.includes(keyword))) {
      return 'high';
    }

    // Use ML classification if available
    if (this.classifier) {
      try {
        const result = await this.classifier(text);
        const sentiment = result[0];
        
        // Map sentiment to priority (negative sentiment often indicates urgent issues)
        if (sentiment.label === 'NEGATIVE' && sentiment.score > 0.8) {
          return 'high';
        }
      } catch (error) {
        console.warn('ML priority classification failed:', error);
      }
    }

    // Check for medium-priority indicators
    if (mediumKeywords.some(keyword => text.includes(keyword))) {
      return 'medium';
    }

    return 'low';
  }

  private categorizeTask(text: string): string {
    const categories = {
      'Frontend': ['ui', 'ux', 'frontend', 'react', 'vue', 'angular', 'css', 'html', 'javascript'],
      'Backend': ['api', 'backend', 'server', 'database', 'sql', 'node', 'python', 'java'],
      'DevOps': ['deploy', 'ci/cd', 'docker', 'kubernetes', 'aws', 'infrastructure'],
      'Security': ['security', 'auth', 'authentication', 'authorization', 'vulnerability'],
      'Testing': ['test', 'testing', 'qa', 'quality', 'automation', 'unit test'],
      'Documentation': ['docs', 'documentation', 'readme', 'guide', 'manual'],
      'Bug Fix': ['bug', 'fix', 'error', 'issue', 'problem', 'broken'],
      'Feature': ['feature', 'new', 'add', 'implement', 'create']
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return category;
      }
    }

    return 'General';
  }

  private estimateComplexity(text: string): 'simple' | 'moderate' | 'complex' {
    const complexityIndicators = {
      simple: ['fix typo', 'update text', 'change color', 'small fix'],
      complex: ['architecture', 'refactor', 'migration', 'integration', 'algorithm', 'performance']
    };

    if (complexityIndicators.complex.some(indicator => text.includes(indicator))) {
      return 'complex';
    }

    if (complexityIndicators.simple.some(indicator => text.includes(indicator))) {
      return 'simple';
    }

    // Default to moderate for most tasks
    return 'moderate';
  }

  private estimateEffort(text: string, complexity: string): number {
    const baseHours = {
      simple: 2,
      moderate: 8,
      complex: 24
    };

    let hours = baseHours[complexity as keyof typeof baseHours];

    // Adjust based on task type
    if (text.includes('research')) hours *= 1.5;
    if (text.includes('documentation')) hours *= 0.7;
    if (text.includes('testing')) hours *= 1.2;

    return Math.round(hours);
  }

  private detectDependencies(text: string): string[] {
    const dependencies = [];
    
    // Look for explicit dependency mentions
    if (text.includes('depends on') || text.includes('requires')) {
      dependencies.push('External dependency detected');
    }
    
    if (text.includes('after') || text.includes('once')) {
      dependencies.push('Sequential dependency');
    }

    return dependencies;
  }

  async generateWorkflowInsights(cards: any[], events: any[]): Promise<WorkflowInsight[]> {
    const insights: WorkflowInsight[] = [];

    // Analyze bottlenecks
    const bottlenecks = this.detectBottlenecks(cards);
    insights.push(...bottlenecks);

    // Analyze velocity patterns
    const velocityInsights = this.analyzeVelocity(events);
    insights.push(...velocityInsights);

    // Detect anomalies
    const anomalies = this.detectAnomalies(cards, events);
    insights.push(...anomalies);

    // Generate optimization suggestions
    const optimizations = this.suggestOptimizations(cards);
    insights.push(...optimizations);

    return insights.sort((a, b) => b.confidence - a.confidence);
  }

  private detectBottlenecks(cards: any[]): WorkflowInsight[] {
    const insights: WorkflowInsight[] = [];
    const columnCounts = cards.reduce((acc, card) => {
      acc[card.columnId] = (acc[card.columnId] || 0) + 1;
      return acc;
    }, {});

    // Check for WIP limit violations
    const inProgress = columnCounts['in-progress'] || 0;
    if (inProgress > 5) {
      insights.push({
        type: 'bottleneck',
        title: 'High WIP in Progress Column',
        description: `${inProgress} items in progress. Consider implementing WIP limits to improve flow.`,
        confidence: 0.9,
        actionable: true,
        impact: 'high'
      });
    }

    // Check for review bottlenecks
    const review = columnCounts['review'] || 0;
    if (review > 3) {
      insights.push({
        type: 'bottleneck',
        title: 'Review Queue Buildup',
        description: `${review} items waiting for review. Consider adding more reviewers or streamlining the process.`,
        confidence: 0.8,
        actionable: true,
        impact: 'medium'
      });
    }

    return insights;
  }

  private analyzeVelocity(events: any[]): WorkflowInsight[] {
    const insights: WorkflowInsight[] = [];
    
    // Analyze completion patterns
    const completions = events.filter(e => e.type === 'CARD_MOVED' && e.payload.toColumn === 'done');
    const recentCompletions = completions.filter(e => 
      Date.now() - e.timestamp < 7 * 24 * 60 * 60 * 1000 // Last 7 days
    );

    if (recentCompletions.length < 3) {
      insights.push({
        type: 'prediction',
        title: 'Low Completion Velocity',
        description: 'Only 2 items completed this week. Consider breaking down larger tasks or addressing blockers.',
        confidence: 0.7,
        actionable: true,
        impact: 'medium'
      });
    }

    return insights;
  }

  private detectAnomalies(cards: any[], events: any[]): WorkflowInsight[] {
    const insights: WorkflowInsight[] = [];

    // Detect cards stuck in columns for too long
    const stuckCards = cards.filter(card => {
      const daysSinceUpdate = (Date.now() - card.updatedAt) / (1000 * 60 * 60 * 24);
      return daysSinceUpdate > 7 && card.columnId !== 'done';
    });

    if (stuckCards.length > 0) {
      insights.push({
        type: 'anomaly',
        title: 'Stagnant Cards Detected',
        description: `${stuckCards.length} cards haven't moved in over a week. They may need attention or re-prioritization.`,
        confidence: 0.85,
        actionable: true,
        impact: 'medium'
      });
    }

    return insights;
  }

  private suggestOptimizations(cards: any[]): WorkflowInsight[] {
    const insights: WorkflowInsight[] = [];

    // Analyze assignee distribution
    const assigneeCounts = cards.reduce((acc, card) => {
      if (card.assignee) {
        acc[card.assignee] = (acc[card.assignee] || 0) + 1;
      }
      return acc;
    }, {});

    const assignees = Object.entries(assigneeCounts);
    if (assignees.length > 1) {
      const maxLoad = Math.max(...Object.values(assigneeCounts) as number[]);
      const minLoad = Math.min(...Object.values(assigneeCounts) as number[]);
      
      if (maxLoad > minLoad * 2) {
        insights.push({
          type: 'optimization',
          title: 'Uneven Workload Distribution',
          description: 'Some team members have significantly more assigned tasks. Consider rebalancing workload.',
          confidence: 0.75,
          actionable: true,
          impact: 'medium'
        });
      }
    }

    return insights;
  }

  async predictCompletion(cards: any[], events: any[]): Promise<VelocityPrediction> {
    const remainingCards = cards.filter(card => card.columnId !== 'done');
    const completedCards = events.filter(e => 
      e.type === 'CARD_MOVED' && e.payload.toColumn === 'done'
    );

    // Calculate average completion time
    const recentCompletions = completedCards.slice(-10); // Last 10 completions
    const avgCompletionTime = recentCompletions.length > 0 
      ? recentCompletions.reduce((sum, event, index) => {
          if (index === 0) return 0;
          return sum + (event.timestamp - recentCompletions[index - 1].timestamp);
        }, 0) / Math.max(recentCompletions.length - 1, 1)
      : 7 * 24 * 60 * 60 * 1000; // Default to 7 days

    const estimatedCompletionTime = remainingCards.length * avgCompletionTime;
    const completionDate = new Date(Date.now() + estimatedCompletionTime);

    return {
      completionDate,
      confidence: Math.min(recentCompletions.length / 10, 1), // Higher confidence with more data
      factors: [
        `${remainingCards.length} remaining tasks`,
        `Average completion: ${Math.round(avgCompletionTime / (24 * 60 * 60 * 1000))} days per task`,
        `Based on last ${recentCompletions.length} completions`
      ],
      risks: [
        remainingCards.some(card => card.priority === 'high') ? 'High-priority tasks may cause delays' : '',
        remainingCards.length > 20 ? 'Large backlog may affect accuracy' : ''
      ].filter(Boolean)
    };
  }

  async findSimilarTasks(currentTask: string, historicalTasks: any[]): Promise<any[]> {
    if (!this.embedder || historicalTasks.length === 0) {
      return [];
    }

    try {
      // Generate embedding for current task
      const currentEmbedding = await this.embedder(currentTask);
      
      // Generate embeddings for historical tasks (with caching)
      const similarities = await Promise.all(
        historicalTasks.map(async (task) => {
          const cacheKey = `embedding_${task.id}`;
          let taskEmbedding = this.modelCache.get(cacheKey);
          
          if (!taskEmbedding) {
            taskEmbedding = await this.embedder(`${task.title} ${task.description}`);
            this.modelCache.set(cacheKey, taskEmbedding);
          }

          // Calculate cosine similarity
          const similarity = this.cosineSimilarity(
            currentEmbedding.data,
            taskEmbedding.data
          );

          return { task, similarity };
        })
      );

      // Return top 5 most similar tasks
      return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5)
        .filter(item => item.similarity > 0.7) // Only return highly similar tasks
        .map(item => ({
          ...item.task,
          similarity: item.similarity
        }));
    } catch (error) {
      console.warn('Similarity search failed:', error);
      return [];
    }
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    
    return dotProduct / (magnitudeA * magnitudeB);
  }

  async generateTaskSuggestions(context: {
    recentCards: any[];
    completedCards: any[];
    currentSprint?: string;
  }): Promise<string[]> {
    const suggestions: string[] = [];

    // Analyze patterns in completed tasks
    const categories = context.completedCards.reduce((acc, card) => {
      const category = this.categorizeTask(`${card.title} ${card.description}`);
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    // Suggest follow-up tasks based on patterns
    if (categories['Bug Fix'] > 3) {
      suggestions.push('Consider adding automated tests to prevent similar bugs');
      suggestions.push('Review error monitoring and alerting setup');
    }

    if (categories['Feature'] > 2) {
      suggestions.push('Update documentation for new features');
      suggestions.push('Plan user training or announcement for new features');
    }

    // Suggest maintenance tasks
    const lastMaintenanceTask = context.completedCards
      .filter(card => card.title.toLowerCase().includes('maintenance'))
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];

    if (!lastMaintenanceTask || Date.now() - lastMaintenanceTask.updatedAt > 30 * 24 * 60 * 60 * 1000) {
      suggestions.push('Schedule routine maintenance tasks');
      suggestions.push('Review and update dependencies');
    }

    return suggestions.slice(0, 5); // Return top 5 suggestions
  }
}

export const aiService = new AIService();