import { KanbanBoard } from './components/KanbanBoard';
import { CommandPalette } from './components/CommandPalette';
import { ThemeProvider } from './providers/ThemeProvider';
import { RecoveryView } from './components/RecoveryScreen';
import { branchingService } from './services/BranchingService';

function App() {
  // An unreadable branch list: show recovery instead of starting the store over it.
  if (branchingService.loadError) return <RecoveryView />;

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 transition-colors duration-200">
        <KanbanBoard />
        <CommandPalette />
      </div>
    </ThemeProvider>
  );
}

export default App;
