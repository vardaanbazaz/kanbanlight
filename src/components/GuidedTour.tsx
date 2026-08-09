import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, GitBranch, Eye, Terminal, Command, ChevronRight, ChevronLeft, Check, X } from 'lucide-react';

interface GuidedTourProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TourStep {
  id: string;
  title: string;
  description: string;
  target: string | null;
  icon: React.ReactNode;
}

export const GuidedTour: React.FC<GuidedTourProps> = ({ isOpen, onClose }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const steps: TourStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to KanbanLight!',
      description: "This isn't just a Kanban board; it's a time-traveling, Git-paradigm project manager.",
      target: null,
      icon: <Sparkles className="w-6 h-6 text-purple-500" />,
    },
    {
      id: 'branching',
      title: 'Branching Workspaces',
      description: 'Create branches to experiment with board layouts without breaking your main state.',
      target: '[data-tour="branch-badge"]',
      icon: <GitBranch className="w-6 h-6 text-blue-500" />,
    },
    {
      id: 'diffs',
      title: 'Visual Tri-Color Diffs',
      description: 'Switching branches? Click Compare to see a visual tri-color diff of added, modified, and deleted tasks.',
      target: '[data-tour="branch-manager-btn"]',
      icon: <Eye className="w-6 h-6 text-indigo-500" />,
    },
    {
      id: 'cli',
      title: 'Developer CLI Bridge',
      description: "Boot up 'kb serve' in your terminal to control this browser UI entirely via the command line.",
      target: '[data-tour="cli-badge"]',
      icon: <Terminal className="w-6 h-6 text-emerald-500" />,
    },
    {
      id: 'command-palette',
      title: 'Command Palette Fast-Pass',
      description: 'Hit ⌘K anytime to navigate fast and execute AI or Git commands.',
      target: '[data-tour="command-palette-btn"]',
      icon: <Command className="w-6 h-6 text-amber-500" />,
    },
  ];

  const currentStep = steps[currentStepIndex];

  const updateTargetPosition = useCallback(() => {
    if (!isOpen || !currentStep || !currentStep.target) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(currentStep.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [isOpen, currentStep]);

  useEffect(() => {
    if (isOpen) {
      updateTargetPosition();
      const timer = setTimeout(updateTargetPosition, 100);
      window.addEventListener('resize', updateTargetPosition);
      window.addEventListener('scroll', updateTargetPosition, true);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateTargetPosition);
        window.removeEventListener('scroll', updateTargetPosition, true);
      };
    }
  }, [isOpen, currentStepIndex, updateTargetPosition]);

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      finishTour();
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const finishTour = () => {
    localStorage.setItem('kanbanlight-tour-completed', 'true');
    setCurrentStepIndex(0);
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        finishTour();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStepIndex]);

  if (!isOpen) return null;

  // Popover positioning logic based on target position
  const getPopoverStyle = (): React.CSSProperties => {
    if (!targetRect) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const popoverWidth = 360;
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;

    let top = targetRect.bottom + 16;
    if (spaceBelow < 200 && spaceAbove > spaceBelow) {
      top = Math.max(20, targetRect.top - 200);
    }

    let left = targetRect.left + targetRect.width / 2 - popoverWidth / 2;
    left = Math.max(20, Math.min(window.innerWidth - popoverWidth - 20, left));

    return {
      top: `${top}px`,
      left: `${left}px`,
    };
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none">
      {/* Background Dim Overlay with Spotlight cutout effect */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300" onClick={finishTour} />

      {/* Target Element Highlight Box */}
      {targetRect && (
        <div
          className="absolute z-50 pointer-events-none rounded-lg ring-4 ring-blue-500/80 ring-offset-2 dark:ring-offset-zinc-950 transition-all duration-300 animate-pulse"
          style={{
            top: `${targetRect.top - 4}px`,
            left: `${targetRect.left - 4}px`,
            width: `${targetRect.width + 8}px`,
            height: `${targetRect.height + 8}px`,
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
          }}
        />
      )}

      {/* Popover Card */}
      <div
        className="fixed z-50 w-80 sm:w-96 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-2xl p-5 transition-all duration-300"
        style={getPopoverStyle()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Card Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-slate-100 dark:bg-zinc-800 rounded-lg">
              {currentStep.icon}
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              Step {currentStepIndex + 1} of {steps.length}
            </span>
          </div>
          <button
            onClick={finishTour}
            className="p-1 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 rounded-lg transition-colors"
            title="Skip Tour (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Card Content */}
        <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100 mb-2 leading-snug">
          {currentStep.title}
        </h3>
        <p className="text-sm text-slate-600 dark:text-zinc-300 mb-5 leading-relaxed">
          {currentStep.description}
        </p>

        {/* Progress Bar & Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-zinc-800">
          {/* Step Dots */}
          <div className="flex items-center space-x-1.5">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === currentStepIndex
                    ? 'w-6 bg-blue-600 dark:bg-blue-400'
                    : 'w-1.5 bg-slate-300 dark:bg-zinc-700'
                }`}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            {currentStepIndex > 0 && (
              <button
                onClick={handlePrev}
                className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}

            <button
              onClick={handleNext}
              className="flex items-center space-x-1 px-3.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-lg shadow-sm transition-colors"
            >
              <span>{currentStepIndex === steps.length - 1 ? 'Get Started' : 'Next'}</span>
              {currentStepIndex === steps.length - 1 ? (
                <Check className="w-3.5 h-3.5 ml-1" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
