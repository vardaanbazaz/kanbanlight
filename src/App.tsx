import { KanbanBoard } from './components/KanbanBoard';
import { CommandPalette } from './components/CommandPalette';
import { ThemeProvider } from './providers/ThemeProvider';

function App() {
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
