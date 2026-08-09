import React, { useState } from 'react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 150,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    const id = setTimeout(() => setIsVisible(true), delay);
    setTimeoutId(id);
  };

  const handleMouseLeave = () => {
    if (timeoutId) clearTimeout(timeoutId);
    setIsVisible(false);
  };

  const positionClasses = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-slate-900/95 dark:border-t-zinc-800 border-x-transparent border-b-transparent border-t-[5px]',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-900/95 dark:border-b-zinc-800 border-x-transparent border-t-transparent border-b-[5px]',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-slate-900/95 dark:border-l-zinc-800 border-y-transparent border-r-transparent border-l-[5px]',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-slate-900/95 dark:border-r-zinc-800 border-y-transparent border-l-transparent border-r-[5px]',
  };

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          className={`absolute z-50 px-2.5 py-1.5 text-xs font-medium rounded-md shadow-xl pointer-events-none transition-all duration-150 ease-out whitespace-nowrap bg-slate-900/95 dark:bg-zinc-800 text-slate-100 dark:text-zinc-100 border border-slate-700/60 dark:border-zinc-700/80 backdrop-blur-sm ${positionClasses[position]}`}
        >
          {content}
          <div className={`absolute w-0 h-0 border-solid ${arrowClasses[position]}`} />
        </div>
      )}
    </div>
  );
};
